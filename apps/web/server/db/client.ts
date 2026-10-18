import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { serverEnv } from '../utils/env'
import * as schema from './schema'

/**
 * Singleton koneksi Postgres + drizzle.
 *
 * Satu pool per proses, dibuat malas (lazy) saat query pertama dan dipakai ulang semua request -
 * bukan pool baru tiap request. `nuxt-security`/Nitro bisa melayani banyak request paralel, dan
 * membuka pool per request akan menghabiskan koneksi Postgres jauh sebelum CPU jadi masalah.
 *
 * Kunci singleton = connection string. Di production hanya ada satu nilai, tapi kunci berbasis
 * string membuat test bisa memakai database berbeda tanpa saling menimpa pool.
 */

export type ServerDatabase = PostgresJsDatabase<typeof schema>

type DbHandle = {
  readonly sql: postgres.Sql
  readonly db: ServerDatabase
}

const handles = new Map<string, DbHandle>()

/**
 * Jumlah maksimum koneksi per proses. 10 cukup untuk API relay (query-nya pendek) dan tetap di
 * bawah `max_connections` default Postgres walau ada beberapa pod.
 */
const MAX_POOL_CONNECTIONS = 10

function handleFor(connectionString: string): DbHandle {
  const existing = handles.get(connectionString)
  if (existing) return existing

  const sql = postgres(connectionString, {
    max: MAX_POOL_CONNECTIONS,
    idle_timeout: 20,
    connect_timeout: 10,
    // Angka besar (server_seq, hlc_wall_ms) dibaca sebagai number, bukan string: kontrak
    // `serverSeqSchema` membatasi ke Number.MAX_SAFE_INTEGER, jadi aman dan tidak perlu konversi
    // di setiap jalur.
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (value: number | bigint) => String(value),
        parse: (value: string) => Number(value),
      },
    },
  })

  const created: DbHandle = { sql, db: drizzle(sql, { schema }) }
  handles.set(connectionString, created)
  return created
}

/** Database dari konfigurasi runtime request ini (secret privat, lihat `server/utils/env.ts`). */
export function useDatabase(event?: H3Event): ServerDatabase {
  return handleFor(serverEnv(event).databaseUrl).db
}

/** Koneksi mentah - dipakai jalur yang butuh SQL langsung (mis. `nextval`, transaksi task). */
export function useSql(event?: H3Event): postgres.Sql {
  return handleFor(serverEnv(event).databaseUrl).sql
}

/** Database dari connection string eksplisit (dipakai test & task yang jalan di luar request). */
export function databaseFor(connectionString: string): ServerDatabase {
  return handleFor(connectionString).db
}

/** Tutup semua pool. Dipanggil test global teardown; server production tidak perlu menutupnya. */
export async function closeAllDatabases(): Promise<void> {
  const open = [...handles.values()]
  handles.clear()
  await Promise.all(open.map((handle) => handle.sql.end({ timeout: 5 })))
}
