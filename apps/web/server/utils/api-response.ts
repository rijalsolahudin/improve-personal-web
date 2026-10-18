/**
 * Status & respons kosong untuk rute API, tanpa memakai `setResponseStatus`/`sendNoContent` milik h3.
 *
 * Kenapa tidak langsung `setResponseStatus(event, code)`: nama itu di-auto-import DUA KALI dengan tipe
 * yang tidak kompatibel. Di sisi server ia datang dari Nitro (h3 v1, versi yang benar-benar berjalan),
 * tapi Nuxt juga meng-auto-import `setResponseStatus` untuk sisi app (`nuxt/dist/app/composables/ssr`,
 * bertipe h3 v2), dan program typecheck app ikut mengompilasi `server/**` (lewat `nitro-imports.d.ts`).
 * Satu event tidak bisa memuaskan dua tipe `H3Event` dari dua versi h3 sekaligus, jadi jalur ini
 * menulis status langsung ke respons - hal yang sama yang dilakukan h3 di dalamnya - dan bertipe benar
 * di SEMUA program typecheck tanpa cast.
 *
 * Dipakai di handler tipis (204/201) dan di `sendApiProblem`, jadi bentuknya sengaja dua: satu untuk
 * respons kosong, satu untuk respons yang punya body.
 */

/** Set status respons. Selalu dipanggil SEBELUM body ditulis (Nitro yang mengirim body-nya). */
export function setApiResponseStatus(event: H3Event, statusCode: number): void {
  event.node.res.statusCode = statusCode
}

/**
 * Akhiri respons dengan status kosong (204) - dipakai endpoint yang memang tidak punya body
 * (logout, revoke perangkat, hapus akun, permintaan OTP).
 *
 * Ini SATU-SATUNYA jalur respons yang sengaja keluar dari amplop: tidak ada DTO, jadi tidak ada
 * `{ "data": ... }` yang bisa ditulis - dan `{ "data": null }` justru memaksa klien membedakan
 * "berhasil tanpa isi" dari "berhasil dengan isi null". Untuk permintaan OTP, body apa pun (termasuk
 * yang sukses) akan jadi oracle untuk menebak email mana yang punya akun.
 *
 * `content-length` dibuang supaya tidak ada header yang bertentangan dengan respons tanpa body.
 */
export function sendApiNoContent(event: H3Event, statusCode = 204): void {
  if (event.node.res.writableEnded) return

  event.node.res.statusCode = statusCode
  event.node.res.removeHeader('content-length')
  event.node.res.end()
}
