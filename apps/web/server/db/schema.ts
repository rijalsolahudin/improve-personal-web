import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { LICENSE_PLAN_IDS } from '@improve-personal/contracts'

/**
 * Skema Postgres server: login (OTP/Google) + lisensi + rate limit. Sejak ADR 15 tidak ada data isi
 * aplikasi di server sama sekali - login hanya membuktikan email pembeli (`licenses`).
 *
 * Sumber yang mengikat: `apps/web/docs/server.dbml` (tabel, enum, index termasuk index partial,
 * catatan implementasi, keputusan D1/D2). Berkas ini harus dibaca bersama dbml itu - kalau salah
 * satunya berubah, yang lain ikut di PR yang sama.
 *
 * Yang SENGAJA tidak ada di sini (dan tidak boleh ditambahkan): tabel atau kolom isi data user.
 * Record hanya hidup di perangkat (ADR 15).
 *
 * Catatan teknis yang memengaruhi bentuk skema:
 * - Index partial (`WHERE revoked_at IS NULL`, `WHERE consumed_at IS NULL`, `WHERE deleted`)
 *   umumnya ditulis di migrasi SQL tangan, bukan di skema ini, supaya bentuk SQL-nya persis seperti
 *   dbml dan tidak bergantung pada dukungan `where()` drizzle-kit. Lihat
 *   `server/db/migrations/0001_partial_indexes.sql`. Pengecualian: index partial yang WAJIB diketahui
 *   drizzle-kit karena mengikat perilaku kode (`uq_devices_user_installation_active` - target
 *   `ON CONFLICT` di `services/device.ts`) ditulis di sini supaya ikut terbawa `drizzle-kit generate`.
 */

export const devicePlatformEnum = pgEnum('device_platform', ['web', 'ios', 'android'])

/** `client_kind` (dbml `sessions.client`, `oauth_states.client`). */
export const clientKindEnum = pgEnum('client_kind', ['web', 'mobile'])

/** `otp_purpose` (dbml `otp_challenges.purpose`). */
export const otpPurposeEnum = pgEnum('otp_purpose', ['login', 'delete_account'])

/**
 * `user_role`. `super_admin` = pemilik/operator: akses penuh tanpa membeli lisensi. Ditentukan dari
 * `NUXT_SUPER_ADMIN_EMAILS` dan disinkronkan setiap login (`server/services/user.ts`).
 */
export const userRoleEnum = pgEnum('user_role', ['super_admin', 'member'])

export type UserRole = (typeof userRoleEnum.enumValues)[number]

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    /** Selalu lowercase; normalisasi di `emailSchema` (`packages/contracts/src/auth.ts`). */
    email: text('email').notNull(),
    role: userRoleEnum('role').notNull().default('member'),
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

export const licensePlanEnum = pgEnum('license_plan', LICENSE_PLAN_IDS)

/**
 * Tabel `licenses` - hak pakai satu email (ADR 15, ADR 16). SATU baris per email; setiap pembelian
 * lunas memperpanjang `expires_at` lewat `license_grants`.
 *
 * Dikunci ke EMAIL, bukan ke `users.id`: pembelian terjadi di halaman beli (lewat payment provider)
 * sebelum pembeli pernah login, jadi baris `users` untuk email itu bisa saja belum ada. Saat aktivasi,
 * email sesi dicocokkan ke kolom ini.
 */
export const licenses = pgTable(
  'licenses',
  {
    id: uuid('id').primaryKey(),
    /** Selalu lowercase (dinormalkan `emailSchema`), sama seperti `users.email`. */
    email: text('email').notNull(),
    /** Paket yang sedang berlaku (pembelian terakhir; `lifetime` tidak pernah turun). */
    plan: licensePlanEnum('plan').notNull(),
    /** Akhir masa aktif. `NULL` = lifetime. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    edition: text('edition').notNull().default('standard'),
    maxActivations: integer('max_activations').notNull().default(5),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_licenses_email').on(table.email)],
)

/**
 * Tabel `license_grants` - satu baris per pembelian yang sudah memperpanjang lisensi.
 *
 * `order_ref` (= `purchases.id`, atau ref manual dari CLI) sebagai PK adalah kunci idempotensi:
 * webhook yang dikirim ulang tidak bisa memperpanjang dua kali.
 */
export const licenseGrants = pgTable('license_grants', {
  orderRef: text('order_ref').primaryKey(),
  licenseId: uuid('license_id')
    .notNull()
    .references(() => licenses.id, { onDelete: 'cascade' }),
  plan: licensePlanEnum('plan').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
})

export const purchaseStatusEnum = pgEnum('purchase_status', ['pending', 'paid', 'failed'])

/**
 * Tabel `purchases` - satu checkout Mayar. Begitu `paid`, lisensi diperpanjang lewat
 * `license_grants.order_ref = purchases.id` (idempoten).
 *
 * Nomor HP pembeli TIDAK disimpan: hanya diteruskan ke Mayar yang mewajibkannya.
 */
export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    plan: licensePlanEnum('plan').notNull(),
    /** Nominal yang ditagih (rupiah) - pembanding `amount` di webhook. */
    amount: integer('amount').notNull(),
    status: purchaseStatusEnum('status').notNull().default('pending'),
    /** Id transaksi Mayar; diisi setelah payment request dibuat. */
    mayarId: text('mayar_id'),
    paymentUrl: text('payment_url'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_purchases_mayar_id').on(table.mayarId),
    index('idx_purchases_email').on(table.email),
  ],
)

/**
 * Tabel `license_activations` - perangkat yang sudah menerima token untuk satu lisensi.
 *
 * Satu baris per (lisensi, perangkat): login ulang di instalasi yang sama memakai baris `devices` yang
 * sama, jadi tidak menghabiskan jatah. Token yang sudah terbit tidak bisa ditarik (diverifikasi
 * offline), jadi baris ini hanya penghitung jatah, bukan daftar token aktif.
 */
export const licenseActivations = pgTable(
  'license_activations',
  {
    licenseId: uuid('license_id')
      .notNull()
      .references(() => licenses.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'pk_license_activations', columns: [table.licenseId, table.deviceId] }),
  ],
)

export type UserRow = typeof users.$inferSelect
export type DeviceRow = typeof devices.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type OtpChallengeRow = typeof otpChallenges.$inferSelect
export type LicenseRow = typeof licenses.$inferSelect
export type LicenseGrantRow = typeof licenseGrants.$inferSelect
export type PurchaseRow = typeof purchases.$inferSelect
