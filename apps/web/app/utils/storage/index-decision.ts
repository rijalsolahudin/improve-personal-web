import type { RecordWrite } from '@improve-personal/core'

/**
 * Keputusan `record_index` untuk satu tulisan record - sama persis dengan `RecordWrite['index']` di
 * core. Alias ini ada supaya kode web bisa menyebutnya tanpa menyalin union-nya.
 *
 * Tiga nilai, dan bedanya penting:
 * - `RecordIndexEntry` - index baru, ditulis menimpa yang lama.
 * - `null` - record ini memang tidak punya dimensi waktu (`user_prefs`, hiasan, ...), jadi baris
 *   index lama HARUS dibuang supaya tidak menunjuk rentang yang sudah tidak berlaku.
 * - `RECORD_INDEX_KEEP` - index tidak bisa dibangun (payload/skema dari app versi lebih baru, payload
 *   rusak), tetapi record-nya tetap sah. Baris index lama DIBIARKAN apa adanya: index lama yang
 *   mungkin sudah basi masih jauh lebih benar daripada menghapusnya - record yang index-nya hilang
 *   tidak akan pernah muncul di kalender/daftar maupun export, dan tidak ada jalur rebuild di web.
 *
 * `RECORD_INDEX_KEEP` sengaja dibedakan dari `null`: `null` adalah pernyataan ("tidak ada dimensi
 * waktu"), `RECORD_INDEX_KEEP` adalah pengakuan ("saya tidak tahu, jangan sentuh"). Menyamakan
 * keduanya = data hilang diam-diam (temuan QA T76 B2).
 *
 * Konstanta ini MILIK `@improve-personal/core` (ia bagian dari union `RecordWrite['index']`); di
 * sini hanya di-re-export supaya UI web dan union di core tidak mungkin berbeda nilai.
 */
export { RECORD_INDEX_KEEP } from '@improve-personal/core'

export type RecordIndexDecision = RecordWrite['index']
