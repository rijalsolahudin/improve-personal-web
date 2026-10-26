import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  customType,
} from 'drizzle-orm/pg-core'

/**
 * Skema Postgres server (relay ciphertext + metadata minimal).
 *
 * Sumber yang mengikat: `apps/web/docs/server.dbml` (tabel, enum, index termasuk index partial,
 * catatan implementasi, keputusan D1/D2). Berkas ini harus dibaca bersama dbml itu - kalau salah
 * satunya berubah, yang lain ikut di PR yang sama.
 *
 * Yang SENGAJA tidak ada di sini (dan tidak boleh ditambahkan):
 * - Tabel isi data user (`todo`, `schedule`, `habit`, `memo`, ...). Server tidak boleh tahu tipe
 *   record: `type` ikut dienkripsi di dalam `records.blob` (ADR 4).
 * - Kolom plaintext apa pun di `records` (tidak ada `type`/`title`/`content`).
 * - Slot envelope `otp` / `recovery`: keduanya keputusan yang sudah diambil (ADR 10 & 11), bukan
 *   pilihan yang tertunda. Yang tersisa hanya `passkey`.
 *
 * Catatan teknis yang memengaruhi bentuk skema:
 * - `bytea` tidak punya tipe bawaan di drizzle, jadi dibuat lewat `customType` di bawah. Nilainya
 *   selalu `Uint8Array` (bukan string base64): konversi base64 <-> biner terjadi di boundaries
 *   (`server/services/sync.ts`, `server/services/keys.ts`), bukan di skema.
 * - HLC dibandingkan sebagai tuple `(hlc_wall_ms, hlc_counter, hlc_device)` - membandingkan string
 *   `hlc` mentah SALAH begitu panjang digitnya beda. Perbandingannya ada di
 *   `@improve-personal/contracts` (`compareHlc`); kolom turunan di sini yang menyimpannya.
 * - Index partial (`WHERE revoked_at IS NULL`, `WHERE consumed_at IS NULL`, `WHERE deleted`)
 *   umumnya ditulis di migrasi SQL tangan, bukan di skema ini, supaya bentuk SQL-nya persis seperti
 *   dbml dan tidak bergantung pada dukungan `where()` drizzle-kit. Lihat
 *   `server/db/migrations/0001_partial_indexes.sql`. Pengecualian: index partial yang WAJIB diketahui
 *   drizzle-kit karena mengikat perilaku kode (`uq_devices_user_installation_active` - target
 *   `ON CONFLICT` di `services/device.ts`) ditulis di sini supaya ikut terbawa `drizzle-kit generate`.
 */

/** `bytea` Postgres - selalu dibaca/ditulis sebagai `Uint8Array`, tidak pernah sebagai string. */
export const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return 'bytea'
  },
})

/** `device_platform` (dbml `devices.platform`). */
export const devicePlatformEnum = pgEnum('device_platform', ['web', 'ios', 'android'])

/** `client_kind` (dbml `sessions.client`, `oauth_states.client`). */
export const clientKindEnum = pgEnum('client_kind', ['web', 'mobile'])

/** `otp_purpose` (dbml `otp_challenges.purpose`). */
export const otpPurposeEnum = pgEnum('otp_purpose', ['login', 'delete_account'])

/**
 * `key_slot` (dbml enum `key_slot`).
 *
 * Hanya `passkey`. Slot `otp` dan `recovery` sudah dihapus lewat ADR 10 & 11 - jangan ditambahkan
 * kembali "sebagai cadangan": server tahu pembuka OTP (dibuat server, ruang 10^6) dan kunci
 * terpisah recovery juga dipegang server, jadi keduanya menurunkan keamanan ke titik terlemah.
 */
export const keySlotEnum = pgEnum('key_slot', ['passkey'])

/** `records_seq` - sumber `records.server_seq`, yaitu cursor pull. */
export const recordsSeq = pgSequence('records_seq', { startWith: 1, increment: 1 })

/** Tabel `users` - akun. Tanpa `deleted_at`: hapus akun = hard delete (dbml `users`). */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    /** Selalu lowercase; normalisasi di `emailSchema` (`packages/contracts/src/auth.ts`). */
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_users_email').on(table.email)],
)

/** Tabel `devices` - daftar perangkat untuk halaman "Perangkat" (PRD F15). */
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Di-trim + panjang dibatasi kontrak (`deviceNameSchema`). */
    name: text('name').notNull(),
    platform: devicePlatformEnum('platform').notNull(),
    /**
     * Penanda INSTALASI yang disumbang client (`deviceInfoSchema.installationId`), bukan penanda mesin.
     *
     * Kenapa perlu: `name` + `platform` saja tidak unik - dua mesin, atau dua profil browser di mesin
     * yang sama, menghasilkan `"Chrome di Linux"` yang identik. Tanpa kolom ini server menganggapnya
     * satu perangkat dan rotasi sesi saat login mematikan sesi instalasi lain (task #80).
     *
     * NULLABLE: baris lama belum punya nilainya (diisi saat login berikutnya lewat jalur adopsi di
     * `resolveDeviceForLogin`). Unik-nya PARTIAL (`uq_devices_user_installation_active`, di index di
     * bawah): satu instalasi = satu baris AKTIF per user, sementara baris yang sudah di-revoke boleh
     * berbagi nilai yang sama (login ulang setelah revoke membuat baris baru) dan dua AKUN di
     * instalasi yang sama tetap boleh - unique global akan menolak login akun kedua di browser itu.
     */
    installationId: uuid('installation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Di-update throttled (>= 5 menit), bukan tiap request (dbml `devices.last_seen_at`). */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Metadata kota dari IP. Dilarang memuat IP mentah. */
    lastIpCity: text('last_ip_city'),
    /** Soft revoke -> jejak audit; butuh retensi. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_devices_user_created').on(table.userId, table.createdAt),
    // Index biasa `idx_devices_user_installation` dihapus di migrasi 0005: semua pencarian perangkat
    // berdasarkan `installation_id` selalu menyaring baris AKTIF, dan index partial unik di bawah
    // sudah melayani pasangan (user_id, installation_id) itu - index kedua hanya menambah biaya tulis.
    /**
     * Invarian "satu instalasi = satu baris AKTIF per user" (temuan L2 security review #80).
     *
     * Tanpa ini, dua login PARALEL dengan `installationId` yang sama sama-sama lolos SELECT lalu
     * sama-sama INSERT: dua baris kembar, sesi baris lama tidak pernah di-rotate lagi (gejala #80
     * kembali), dan jatah 10 perangkat terpakai dua kali. Kode di `services/device.ts` menangani
     * konfliknya jadi "pakai baris yang menang", bukan 500.
     *
     * PARTIAL, bukan unique global:
     * - `installation_id IS NOT NULL` - baris lama (klien yang belum mengirim nilai) tidak ikut serta.
     * - `revoked_at IS NULL` - baris yang sudah di-revoke boleh berbagi nilai yang sama; login ulang
     *   setelah revoke memang membuat baris baru, dan riwayatnya tetap tersimpan untuk audit.
     * Unik per `user_id` (bukan lintas akun): dua akun di instalasi yang sama tetap boleh login.
     */
    uniqueIndex('uq_devices_user_installation_active')
      .on(table.userId, table.installationId)
      .where(sql`${table.installationId} is not null and ${table.revokedAt} is null`),
    // `idx_devices_user_active` = PARTIAL (WHERE revoked_at IS NULL) -> migrasi SQL tangan.
  ],
)

/** Tabel `sessions` - token opaque; server cuma menyimpan hash. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    /** Denormalisasi: jalur panas cek ownership tiap request. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    /** `sha256(token)`. Token mentah TIDAK PERNAH disimpan atau di-log. */
    tokenHash: text('token_hash').notNull(),
    client: clientKindEnum('client').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    /** Idle 30 hari; absolut 180 hari dari `created_at`. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('uq_sessions_token_hash').on(table.tokenHash),
    index('idx_sessions_expires').on(table.expiresAt),
    // `idx_sessions_user_active` = PARTIAL (WHERE revoked_at IS NULL) -> migrasi SQL tangan.
  ],
)

/** Tabel `otp_challenges` - kode OTP; disimpan hanya sebagai hash. */
export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').primaryKey(),
    /** `HMAC-SHA256(email, OTP_PEPPER)` - bukan email polos. */
    emailHash: text('email_hash').notNull(),
    /** `HMAC-SHA256(code, OTP_PEPPER)`; dibanding timing-safe. */
    codeHash: text('code_hash').notNull(),
    purpose: otpPurposeEnum('purpose').notNull().default('login'),
    /** `HMAC-SHA256(ip, RATE_LIMIT_PEPPER)` - bukan IP polos. */
    ipHash: text('ip_hash'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** <= 10 menit (PRD F15). */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Sekali pakai: `UPDATE ... WHERE consumed_at IS NULL`. */
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_otp_expires').on(table.expiresAt),
    // `idx_otp_email_open` = PARTIAL (WHERE consumed_at IS NULL) -> migrasi SQL tangan.
  ],
)

/** Tabel `oauth_states` - state + PKCE verifier Google SSO. Sekali pakai, TTL <= 10 menit. */
export const oauthStates = pgTable(
  'oauth_states',
  {
    /** `sha256(state)`; state mentah cuma dikirim ke Google. */
    stateHash: text('state_hash').primaryKey(),
    /** PKCE S256. */
    codeVerifier: text('code_verifier').notNull(),
    /** Dicek ke klaim `nonce` di ID token. */
    nonce: text('nonce').notNull(),
    client: clientKindEnum('client').notNull(),
    /** Validasi harus persis salah satu yang terdaftar per environment. */
    redirectUri: text('redirect_uri').notNull(),
    /**
     * Instalasi yang MEMULAI flow (task #80), dibawa dari query `/auth/google/start`.
     *
     * Disimpan di baris state, bukan dibaca lagi dari callback: query callback strict dan sengaja
     * tidak punya field ini, jadi nilai yang dipakai saat menerbitkan sesi hanya berasal dari baris
     * yang server sendiri tulis (state + PKCE sudah membuktikannya). Kalau callback boleh
     * menentukannya, penyerang bisa memilih baris `devices` mana yang dipakai ulang.
     *
     * Nullable: klien lama/mobile belum mengirimnya, dan perilakunya harus tetap seperti sebelumnya.
     */
    installationId: uuid('installation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [index('idx_oauth_states_expires').on(table.expiresAt)],
)

/**
 * Tabel `rate_limits` - fixed window di Postgres, BUKAN memori.
 *
 * Alasannya tegas (dbml header): supaya benar kalau pod-nya banyak. Karena itu
 * `security.rateLimiter` bawaan nuxt-security (in-memory) dimatikan di `nuxt.config.ts`, dan
 * penghitung sesungguhnya ada di tabel ini.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    /** `otp:email` | `otp:ip` | `otp:verify` | `google:start:ip` | `sync:push` | `keys:envelope` | `account:delete`. */
    scope: text('scope').notNull(),
    /** `HMAC-SHA256(identifier, RATE_LIMIT_PEPPER)` - bukan email/IP/user polos. */
    bucket: text('bucket').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [
    primaryKey({ name: 'pk_rate_limits', columns: [table.scope, table.bucket, table.windowStart] }),
  ],
)

/** Tabel `key_envelopes` - HANYA slot `passkey`; server tidak pernah mendekripsi isinya. */
export const keyEnvelopes = pgTable(
  'key_envelopes',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slot: keySlotEnum('slot').notNull(),
    /** Blob opak; server tidak punya jalur kode untuk membukanya. Batas ~4 KB di kontrak. */
    wrappedKey: bytea('wrapped_key').notNull(),
    /** Parameter KDF milik client; server tidak menafsirkannya. Batas ~1 KB di kontrak. */
    kdfParams: jsonb('kdf_params').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_key_envelopes_user_slot').on(table.userId, table.slot)],
)

/** Tabel `key_transfers` - relay tambah perangkat (TTL <= 2 menit, sekali pakai). */
export const keyTransfers = pgTable(
  'key_transfers',
  {
    /** Random 128-bit base64url, non-enumerable - bukan UUID berurut. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Hanya perangkat target yang sudah login boleh claim. */
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    /** MK terenkripsi ke public key ephemeral perangkat baru. */
    blob: bytea('blob').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Sekali pakai: `UPDATE ... WHERE claimed_at IS NULL RETURNING blob`. */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
  },
  (table) => [index('idx_key_transfers_expires').on(table.expiresAt)],
)

/** Tabel `records` - satu-satunya tabel isi data user, dan isinya selalu ciphertext. */
export const records = pgTable(
  'records',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** UUIDv7 dibuat client. */
    id: uuid('id').notNull(),
    /** String `${wallMs}-${counter}-${deviceId}` apa adanya, dikembalikan seperti diterima. */
    hlc: text('hlc').notNull(),
    /** Hasil pecah `hlc` - inilah yang dibandingkan, bukan string mentahnya. */
    hlcWallMs: bigint('hlc_wall_ms', { mode: 'number' }).notNull(),
    hlcCounter: integer('hlc_counter').notNull(),
    /** `deviceId` lowercase tanpa dash, biar urutan leksikografis konsisten. */
    hlcDevice: text('hlc_device').notNull(),
    /** Tombstone. */
    deleted: boolean('deleted').notNull().default(false),
    /** XChaCha20-Poly1305(type + schemaVersion + data), AAD = id. `type` ikut terenkripsi (ADR 4). */
    blob: bytea('blob').notNull(),
    /** `nextval('records_seq')` - cursor pull. */
    serverSeq: bigint('server_seq', { mode: 'number' })
      .notNull()
      .default(sql`nextval('records_seq')`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Dipakai job purge tombstone. */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'pk_records', columns: [table.userId, table.id] }),
    // Unique (user_id, server_seq) sekaligus jadi index pull: `server_seq > cursor ORDER BY
    // server_seq` ter-scope user_id, jadi tidak perlu index tambahan.
    uniqueIndex('uq_records_user_server_seq').on(table.userId, table.serverSeq),
    index('idx_records_hlc').on(table.hlcWallMs, table.hlcCounter, table.hlcDevice, table.userId),
    // `idx_records_purge` = PARTIAL (WHERE deleted) -> migrasi SQL tangan.
  ],
)

/**
 * Tabel `sync_watermarks` - sabuk pengaman purge.
 *
 * Kalau cursor klien < `purged_seq`, server balas `409 SYNC_RESET_REQUIRED` supaya klien full
 * resync. Tanpa ini, HP yang lama offline bisa "menghidupkan lagi" data yang user sudah hapus
 * (zombie resurrection).
 */
export const syncWatermarks = pgTable('sync_watermarks', {
  /** 1:1 dengan `users.id`, ditegakkan lewat PK (bukan Ref 1:1 yang gampang terbalik). */
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** `server_seq` tertinggi yang sudah dipurge. */
  purgedSeq: bigint('purged_seq', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type UserRow = typeof users.$inferSelect
export type DeviceRow = typeof devices.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type OtpChallengeRow = typeof otpChallenges.$inferSelect
export type KeyEnvelopeRow = typeof keyEnvelopes.$inferSelect
export type KeyTransferRow = typeof keyTransfers.$inferSelect
export type RecordRow = typeof records.$inferSelect
export type SyncWatermarkRow = typeof syncWatermarks.$inferSelect
