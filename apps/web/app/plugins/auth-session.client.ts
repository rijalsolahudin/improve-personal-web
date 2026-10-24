/**
 * Pemicu sinkronisasi identitas sesi antar-tab (lihat `~/utils/auth/session-sync`).
 *
 * Isinya sengaja hanya satu `import()`: seluruh modul kanal (transport + pendengar + reload saat akun
 * berganti) termuat sebagai chunk terpisah. Kalau ia diimpor statis dari sini, ia ikut masuk graf awal
 * SETIAP rute dan menembus budget JS awal 170 KB gzip (performance.md) - padahal landing/login tidak
 * memegang data akun yang bisa basi. Chunk-nya tetap dimuat tak lama setelah hidrasi, bukan saat
 * interaksi pertama.
 *
 * Kegagalan memuat chunk (offline tepat saat start) sengaja ditelan: ini jaring pengaman latar, bukan
 * syarat aplikasi bisa dipakai. Tab basi tetap tidak bisa merusak data karena server menolak batch
 * dengan identitas yang tidak cocok.
 */
export default defineNuxtPlugin((nuxtApp) => {
  void import('~/utils/auth/session-sync')
    .then((sessionSync) => {
      sessionSync.installSessionSync(nuxtApp)
    })
    .catch(() => undefined)
})
