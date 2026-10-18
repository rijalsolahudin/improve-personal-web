import { eq } from 'drizzle-orm'

import { users, type UserRow } from '../db/schema'
import { uuidv7 } from '../utils/uuid'
import type { ServiceContext } from './context'

/**
 * Baris `users` - akun.
 *
 * Dipisah dari `account.ts` (hapus akun) supaya tidak ada impor melingkar: `otp.ts` butuh "cari atau
 * buat user", sedangkan `account.ts` butuh `otp.ts` untuk memverifikasi kode konfirmasi. Satu berkas
 * kecil yang tidak mengimpor keduanya memutus siklus itu.
 *
 * Email selalu datang dalam bentuk yang sudah dinormalkan `emailSchema` (trim + lowercase) - bukan
 * dinormalkan lagi di sini, supaya tidak ada dua tempat yang bisa berbeda pendapat.
 */

export async function findUserByEmail(ctx: ServiceContext, email: string): Promise<UserRow | null> {
  const rows = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1)
  return rows[0] ?? null
}

/**
 * Akun dibuat saat kode OTP terbukti benar, bukan saat permintaan kode.
 *
 * Kalau baris user dibuat saat request OTP, tabel `users` bisa diisi siapa saja yang mengetik email
 * orang lain - daftar akun jadi tidak bisa dipercaya sekaligus jadi cara menghitung email terdaftar.
 */
export async function findOrCreateUserByEmail(
  ctx: ServiceContext,
  email: string,
): Promise<UserRow> {
  const existing = await findUserByEmail(ctx, email)
  if (existing) return existing

  const inserted = await ctx.db
    .insert(users)
    .values({ id: uuidv7(ctx.now.getTime()), email, createdAt: ctx.now })
    // Dua login paralel untuk email yang sama bisa sampai ke sini bersamaan; `ON CONFLICT DO NOTHING`
    // membuat yang kalah mengambil baris milik yang menang, bukan gagal dengan unique violation.
    .onConflictDoNothing({ target: users.email })
    .returning()

  const created = inserted[0]
  if (created) return created

  const raced = await findUserByEmail(ctx, email)
  if (!raced) throw new Error('user tidak ditemukan setelah konflik insert')
  return raced
}
