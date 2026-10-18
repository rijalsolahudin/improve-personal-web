import { useDatabase, type ServerDatabase } from '../db/client'
import type { ServerEnv } from '../utils/env'

/**
 * Konteks yang diterima service.
 *
 * Service sengaja TIDAK memanggil `useRuntimeConfig`/`useDatabase` sendiri: dengan menerima `db`,
 * `env`, dan `now` sebagai argumen, service bisa diuji langsung terhadap Postgres nyata (dengan waktu
 * yang ditentukan test) tanpa membangun instance Nitro. Handler yang merakit konteks ini.
 */
export type ServiceContext = {
  readonly db: ServerDatabase
  readonly env: ServerEnv
  /** Waktu request. Di-inject supaya perilaku TTL/expiry bisa diuji tanpa `setTimeout`. */
  readonly now: Date
  /** IP klien hasil `resolveClientIp` (proxy terpercaya saja), atau `null` kalau tidak diketahui. */
  readonly clientIp: string | null
}

/** Rakit konteks dari request. Hanya dipanggil handler. */
export function serviceContext(event: H3Event): ServiceContext {
  const env = serverEnv(event)

  return {
    db: useDatabase(event),
    env,
    now: new Date(),
    clientIp: clientIpOf(event, env.trustedProxyHops),
  }
}
