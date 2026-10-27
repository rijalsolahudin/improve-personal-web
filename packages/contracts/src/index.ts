/**
 * `@improve-personal/contracts` - kontrak API v1 bersama + perbandingan HLC.
 *
 * Dipakai `apps/server` (Hono), `packages/core`, `apps/web` (Nuxt), dan `apps/mobile` (React Native).
 * Paket ini sengaja TS murni: tanpa Node API, DOM, Vue, atau React (ARCHITECTURE.md §3), jadi bisa
 * diimpor dari mana saja tanpa cabang platform. Isinya HANYA kontrak: schema zod, DTO, konstanta
 * protokol, dan perbandingan HLC.
 *
 * Bukan tempatnya (biar tidak jadi dua sumber kebenaran):
 * - tipe entitas domain (todo/schedule/habit/goal/jurnal) -> `packages/core`
 * - implementasi kripto (Argon2id, XChaCha20-Poly1305, BIP39) -> `packages/crypto`
 * - logika server (service, middleware, query DB) -> `apps/server`
 *
 * Urutan dependensi antar modul (satu arah, tanpa siklus):
 *
 *   protocol.ts -> devices.ts -> auth.ts -> account.ts
 *   protocol.ts -> sync.ts (juga memakai hlc.ts)
 *   hlc.ts + protocol.ts + sync.ts -> record-format.ts
 *   protocol.ts + devices.ts + auth.ts + record-format.ts -> keys.ts
 *   hlc.ts      -> mandiri, tidak mengimpor modul lain di paket ini
 *
 * Aturan yang berlaku untuk semua schema request: `.strict()` (field asing ditolak) dan TIDAK ADA
 * field `user_id` - identitas user selalu datang dari sesi di server (ARCHITECTURE.md §8). Perubahan
 * breaking wajib lewat versi protokol baru, bukan mengubah schema `v1` diam-diam: app mobile versi lama
 * tetap memanggil `v1`.
 */

// -----------------------------------------------------------------------------
// HLC - perbandingan versi record (poison compare, sengaja cuma ada di sini)
// -----------------------------------------------------------------------------

export {
  HLC_INVALID_REASONS,
  HLC_MAX_COUNTER,
  HLC_MAX_DEVICE_ID_LENGTH,
  HLC_MAX_LENGTH,
  HLC_MAX_WALL_MS,
  HLC_SEPARATOR,
  HlcFormatError,
  compareHlc,
  formatHlc,
  hlcSchema,
  isValidHlc,
  normalizeDeviceId,
  parseHlc,
  tryParseHlc,
  type HlcInvalidReason,
  type HlcOrder,
  type HlcParseResult,
  type HlcTuple,
} from './hlc.ts'

// -----------------------------------------------------------------------------
// Protokol: versi, prefix, kode error, amplop respons (`{ data }` / `{ error }`),
// primitif wire format
// -----------------------------------------------------------------------------

export {
  API_PREFIX,
  API_VERSION,
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  GENERIC_ERROR_MESSAGES,
  ISO_INSTANT_MAX_LENGTH,
  ISO_INSTANT_PATTERN,
  UUID_PATTERN,
  apiDataEnvelopeSchema,
  apiErrorBodySchema,
  apiErrorSchema,
  apiResponseSchema,
  base64MaxLengthForBytes,
  base64WithinBytesSchema,
  errorCodeSchema,
  integerQuerySchema,
  isBase64,
  isIsoInstant,
  isoInstantSchema,
  optionalIntegerQuerySchema,
  utf8ByteLength,
  uuidSchema,
  type ApiError,
  type ApiErrorBody,
  type ApiResponse,
  type ApiSuccessResponse,
  type ApiVersion,
  type ErrorCode,
  type ErrorHttpStatus,
} from './protocol.ts'

// -----------------------------------------------------------------------------
// Perangkat
// -----------------------------------------------------------------------------

export {
  DEVICE_CITY_MAX_LENGTH,
  DEVICE_LIST_MAX,
  DEVICE_NAME_MAX_LENGTH,
  DEVICE_PLATFORMS,
  MAX_ACTIVE_DEVICES_PER_USER,
  deviceDtoSchema,
  deviceListResultSchema,
  deviceNameSchema,
  devicePlatformSchema,
  deviceRevokeParamsSchema,
  type DeviceDto,
  type DeviceListResult,
  type DevicePlatform,
  type DeviceRevokeParams,
} from './devices.ts'

// -----------------------------------------------------------------------------
// Auth: OTP, Google SSO, sesi
// -----------------------------------------------------------------------------

export {
  CLIENT_KINDS,
  EMAIL_MAX_LENGTH,
  OTP_CODE_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  SESSION_TOKEN_MIN_LENGTH,
  clientKindSchema,
  currentSessionResultSchema,
  deviceInfoSchema,
  emailSchema,
  googleCallbackQuerySchema,
  googleStartQuerySchema,
  googleStartResultSchema,
  mobileSessionDtoSchema,
  otpCodeSchema,
  otpRequestInputSchema,
  otpVerifyInputSchema,
  sessionDeviceSchema,
  sessionDtoSchema,
  sessionUserSchema,
  webSessionDtoSchema,
  type ClientKind,
  type CurrentSessionResult,
  type DeviceInfo,
  type GoogleCallbackQuery,
  type GoogleStartQuery,
  type GoogleStartResult,
  type MobileSessionDto,
  type OtpRequestInput,
  type OtpVerifyInput,
  type SessionDevice,
  type SessionDto,
  type SessionUser,
  type WebSessionDto,
} from './auth.ts'

// -----------------------------------------------------------------------------
// Sync: push/pull delta, batch, cursor
// -----------------------------------------------------------------------------

export {
  SEALED_RECORD_MAX_BLOB_BASE64_LENGTH,
  SEALED_RECORD_MAX_BLOB_BYTES,
  SYNC_DEFAULT_PULL_LIMIT,
  SYNC_MAX_BATCH,
  SYNC_MAX_PULL_BYTES,
  SYNC_MAX_PULL_LIMIT,
  SYNC_MIN_PULL_LIMIT,
  SYNC_RECORD_STATUSES,
  SYNC_TOMBSTONE_RETENTION_DAYS,
  sealedRecordDtoSchema,
  serverRecordSchema,
  serverSeqSchema,
  syncPullQuerySchema,
  syncPullResultSchema,
  syncPushInputSchema,
  syncPushResultSchema,
  syncRecordResultSchema,
  syncRecordStatusSchema,
  type SealedRecordDto,
  type ServerRecord,
  type SyncPullQuery,
  type SyncPullResult,
  type SyncPushInput,
  type SyncPushResult,
  type SyncRecordResult,
  type SyncRecordStatus,
} from './sync.ts'

// -----------------------------------------------------------------------------
// Envelope kunci + transfer kunci (hanya slot `passkey`, ADR 10-12)
// -----------------------------------------------------------------------------

export {
  KDF_PARAM_KEY_MAX_LENGTH,
  KDF_PARAM_MAX_KEYS,
  KDF_PARAM_STRING_VALUE_MAX_LENGTH,
  KEY_ENVELOPE_MAX_KDF_PARAMS_BYTES,
  KEY_ENVELOPE_MAX_WRAPPED_KEY_BASE64_LENGTH,
  KEY_ENVELOPE_MAX_WRAPPED_KEY_BYTES,
  KEY_SLOTS,
  KEY_TRANSFER_ID_BYTES,
  KEY_TRANSFER_ID_LENGTH,
  KEY_TRANSFER_ID_PATTERN,
  KEY_TRANSFER_MAX_BLOB_BYTES,
  KEY_TRANSFER_TTL_SECONDS,
  kdfParamsSchema,
  keyEnvelopeDtoSchema,
  keyEnvelopeListResultSchema,
  keyEnvelopePutInputSchema,
  keyIdentityClaimInputSchema,
  keyIdentityConflictDetailsSchema,
  keyIdentityDtoSchema,
  keySlotSchema,
  keyTransferClaimParamsSchema,
  keyTransferClaimResultSchema,
  keyTransferCreateInputSchema,
  keyTransferCreateResultSchema,
  keyTransferIdSchema,
  type KdfParams,
  type KeyEnvelopeDto,
  type KeyEnvelopeListResult,
  type KeyEnvelopePutInput,
  type KeyIdentityClaimInput,
  type KeyIdentityConflictDetails,
  type KeyIdentityDto,
  type KeySlot,
  type KeyTransferClaimParams,
  type KeyTransferClaimResult,
  type KeyTransferCreateInput,
  type KeyTransferCreateResult,
} from './keys.ts'

// -----------------------------------------------------------------------------
// Format blob record v2 + KID (spec #120): layout, AAD biner kanonik, padding, batas plaintext
// -----------------------------------------------------------------------------

export {
  KID_BYTES,
  KID_KDF_CONTEXT,
  KID_KDF_SUBKEY_ID,
  KID_WIRE_LENGTH,
  KID_WIRE_PATTERN,
  RECORD_AAD_V2_LABEL,
  RECORD_BLOB_MAGIC,
  RECORD_BLOB_VERSION_V2,
  RECORD_PAD_BLOCK_BYTES,
  RECORD_V2_CIPHERTEXT_OFFSET,
  RECORD_V2_HEADER_BYTES,
  RECORD_V2_KID_OFFSET,
  RECORD_V2_NONCE_BYTES,
  RECORD_V2_NONCE_OFFSET,
  RECORD_V2_TAG_BYTES,
  RECORD_V2_VERSION_OFFSET,
  SEALED_RECORD_V2_MAX_PLAINTEXT_BYTES,
  SEALED_RECORD_V2_OVERHEAD_BYTES,
  V1_CUTOFF_GRACE_MS,
  V1_CUTOFF_MS,
  decodeKid,
  encodeKid,
  encodeRecordAadV2,
  encodeSealedBlobHeaderV2,
  isPlaintextWithinV2Limit,
  kidSchema,
  parseSealedBlobHeader,
  sealedRecordV2BlobBytes,
  type RecordAadV2Input,
  type SealedBlobHeaderV2,
} from './record-format.ts'

// -----------------------------------------------------------------------------
// Akun: hapus akun permanen
// -----------------------------------------------------------------------------

export {
  OTP_PURPOSES,
  deleteAccountInputSchema,
  otpPurposeSchema,
  type DeleteAccountInput,
  type OtpPurpose,
} from './account.ts'
