import { eq } from 'drizzle-orm'

import { users, type UserRole, type UserRow } from '../db/schema'
import { uuidv7 } from '../utils/uuid'
import type { ServiceContext } from './context'

/**
 * Baris `users` - akun.
 *
 * Email selalu datang dalam bentuk yang sudah dinormalkan `emailSchema` (trim + lowercase) - bukan
 * dinormalkan lagi di sini, supaya tidak ada dua tempat yang bisa berbeda pendapat.
 */

/** Role menurut `NUXT_SUPER_ADMIN_EMAILS`; env adalah sumber kebenaran, kolom `users.role` cerminnya. */
export function roleForEmail(superAdminEmails: readonly string[], email: string): UserRole {
  return superAdminEmails.includes(email) ? 'super_admin' : 'member'
}

async function findUserByEmail(ctx: ServiceContext, email: string): Promise<UserRow | null> {
  const rows = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1)
  return rows[0] ?? null
}

/**
 * Akun dibuat saat kode OTP terbukti benar, bukan saat permintaan kode.
 *
 * Kalau baris user dibuat saat request OTP, tabel `users` bisa diisi siapa saja yang mengetik email
 * orang lain - daftar akun jadi tidak bisa dipercaya sekaligus jadi cara menghitung email terdaftar.
 *
 * Role disinkronkan dengan env di setiap login, jadi menambah/menghapus super admin berlaku di login
 * berikutnya tanpa migrasi data.
 */
export async function findOrCreateUserByEmail(
  ctx: ServiceContext,
  email: string,
): Promise<UserRow> {
  const role = roleForEmail(ctx.env.superAdminEmails, email)
  const existing = await findUserByEmail(ctx, email)
  if (existing) return syncRole(ctx, existing, role)

  const inserted = await ctx.db
    .insert(users)
    .values({ id: uuidv7(ctx.now.getTime()), email, role, createdAt: ctx.now })
    // Dua login paralel untuk email yang sama bisa sampai ke sini bersamaan; `ON CONFLICT DO NOTHING`
    // membuat yang kalah mengambil baris milik yang menang, bukan gagal dengan unique violation.
    .onConflictDoNothing({ target: users.email })
    .returning()

  const created = inserted[0]
  if (created) return created

  const raced = await findUserByEmail(ctx, email)
  if (!raced) throw new Error('user tidak ditemukan setelah konflik insert')
  return syncRole(ctx, raced, role)
}

async function syncRole(ctx: ServiceContext, user: UserRow, role: UserRole): Promise<UserRow> {
  if (user.role === role) return user
  const [updated] = await ctx.db
    .update(users)
    .set({ role })
    .where(eq(users.id, user.id))
    .returning()
  return updated ?? user
}
