import { STYLE_NAMES, THEME_NAMES } from '@improve-personal/tokens'

/**
 * Preferensi tampilan (PRD F16) di level TEKNIS: nama key penyimpanan cache + skrip pra-render.
 *
 * Sumber kebenaran preferensi adalah record `user_prefs` per akun (lihat `useAppearancePrefs`).
 * `localStorage` di sini hanya CACHE untuk melukis tema/gaya sebelum JavaScript jalan - bukan tempat
 * menyimpan pilihan. Karena itu isinya tidak pernah dipercaya: skrip di bawah memvalidasi ke daftar
 * putih, dan store memvalidasi lagi saat membaca.
 *
 * Key sengaja tetap `ip-theme`/`ip-style` supaya pilihan yang sudah tersimpan di perangkat user dari
 * versi sebelumnya tidak hilang saat upgrade (prefix `ip-` membuatnya ikut dibersihkan saat logout).
 */
export const THEME_STORAGE_KEY = 'ip-theme'
export const STYLE_STORAGE_KEY = 'ip-style'

/**
 * Pemilik cache tampilan (id akun). Dipakai untuk mencegah preferensi satu akun terbawa ke akun lain
 * di browser yang sama ketika sesi berganti tanpa logout penuh. Bukan data sensitif: hanya UUID akun
 * yang sedang login, dan tidak pernah dikirim ke mana pun.
 */
export const APPEARANCE_OWNER_STORAGE_KEY = 'ip-appearance-owner'

const quotedList = (names: readonly string[]): string => names.map((name) => `'${name}'`).join(',')

/**
 * Skrip inline PRA-RENDER (AC T25: gaya terpasang sebelum render pertama, tanpa kedip).
 *
 * Dijalankan browser saat parsing `<head>`, sebelum paint pertama dan sebelum bundle Vue ada, jadi
 * tidak ada momen "Kuning/Cute lalu berubah". Batasan yang membentuk bentuknya:
 *
 * - **Statis, tanpa data per-request.** Isinya sama untuk semua user sehingga aman untuk CSP: di
 *   halaman SSR (`/app`, `/login`) `nuxt-security` menambahkan nonce ke tag `<script>` saat render,
 *   dan di halaman hasil prerender (`/`) `hashScripts` menghitung hash-nya. Tidak ada `'unsafe-inline'`.
 * - **Tanpa `<`, `&&`, atau template literal.** Tag `innerHTML` di-hash apa adanya oleh CSP, jadi
 *   teks skrip harus identik dengan yang dieksekusi browser; menghindari `&&`/`<` membuatnya tidak
 *   bergantung pada aturan escaping HTML.
 * - **Gagal = diam.** Storage bisa diblokir (mode privat); dalam hal itu tema default yang dilukis,
 *   bukan halaman error.
 *
 * Nilai yang dibaca divalidasi ke daftar gaya/tema resmi: isi `localStorage` berasal dari perangkat
 * user dan tidak boleh langsung dipercaya sebagai nilai atribut.
 */
export const EARLY_APPEARANCE_SCRIPT = [
  '(function(){try{',
  `var d=document.documentElement,t=[${quotedList(THEME_NAMES)}],s=[${quotedList(STYLE_NAMES)}],`,
  `a=localStorage.getItem('${THEME_STORAGE_KEY}'),b=localStorage.getItem('${STYLE_STORAGE_KEY}');`,
  'if(a!==null){if(t.indexOf(a)>-1){d.setAttribute("data-theme",a)}}',
  'if(b!==null){if(s.indexOf(b)>-1){d.setAttribute("data-style",b)}}',
  '}catch(e){}})()',
].join('')
