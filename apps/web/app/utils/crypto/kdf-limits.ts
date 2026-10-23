/**
 * Batas atas parameter Argon2id yang diterima dari artefak milik user.
 *
 * `ops`/`mem` ikut tertulis di dalam artefaknya sendiri (kode `iprk1.*`, berkas envelope recovery, berkas
 * terenkripsi kata sandi). Artinya artefak buatan orang lain bisa meminta KDF yang membuat tab membeku
 * atau kehabisan memori - persis risiko yang diminta dijaga di PRD 912.
 *
 * Batasnya setara preset libsodium `SENSITIVE` (`ops`) dan `MODERATE` (`mem`), jauh di atas preset
 * `INTERACTIVE` yang dipakai saat membuat semua artefak ini. Jadi envelope/berkas yang pernah dibuat
 * aplikasi ini selalu lolos, dan menaikkan biaya KDF nanti masih mungkin sampai batas ini tanpa membuat
 * artefak lama tidak bisa dibuka.
 *
 * Satu definisi untuk semua jalur: kalau salah satu schema melonggarkan batasnya, jalur itu jadi pintu
 * masuk DoS.
 */

/** Batas `opslimit` Argon2id yang boleh dijalankan dari parameter artefak user. */
export const MAX_KDF_OPS = 4

/** Batas `memlimit` Argon2id (byte) yang boleh dijalankan dari parameter artefak user. 256 MiB. */
export const MAX_KDF_MEM_BYTES = 256 * 1024 * 1024
