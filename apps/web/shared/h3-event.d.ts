/**
 * Tipe event yang dipakai runtime Nitro, diturunkan dari fungsi globalnya sendiri.
 *
 * Kenapa bukan `import type { H3Event } from 'h3'` (cara yang biasa dipakai): di instalasi ini alias
 * `h3` di tsconfig yang di-generate Nuxt menunjuk ke h3 v2 (versi yang dipakai sisi Nuxt), sedangkan
 * runtime server + semua helper yang di-auto-import (`getMethod`, `setHeader`, `readValidatedBody`,
 * ...) bertipe h3 v1 (lewat nitropack). Dua tipe bernama `H3Event` dari dua versi berbeda tidak saling
 * kompatibel, jadi mengimpornya membuat setiap pemanggilan helper jadi error tipe padahal kodenya
 * benar. Hanya SATU tempat yang tidak bisa dihindari: `useRuntimeConfig` (lihat catatan di
 * `server/utils/env.ts`).
 *
 * Tipe di sini diturunkan dari signature fungsi global yang memang dipanggil runtime, jadi tidak
 * mungkin melenceng dari versi yang benar tanpa ketahuan.
 *
 * Berkasnya diletakkan di `shared/` karena HANYA direktori itu yang ikut keempat tsconfig yang
 * di-generate Nuxt (app, server, shared, node). Menaruhnya di `server/**` membuat project app - yang
 * ikut menarik `server/utils/**` lewat `nitro-imports.d.ts` - tidak melihat deklarasi ini, dan error
 * lamanya balik lagi.
 */

declare global {
  type H3Event = Parameters<typeof getMethod>[0]
}

export {}
