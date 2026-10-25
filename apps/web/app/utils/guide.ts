import { APP_HOME_PATH, getFeature } from './features'

/**
 * Isi halaman Panduan (PRD F9, T15).
 *
 * Kenapa teksnya di modul ini, bukan di `i18n/locales`:
 * panduan adalah dokumen panjang (16 fitur x ringkasan + tips, bagian keamanan, FAQ) yang isinya
 * ikut berubah bersama kode fitur. Menaruhnya di sini membuat satu section = satu objek bertipe,
 * sehingga typecheck + test bisa memastikan F1–F16 tercakup dan anchor-nya unik. Label navigasi
 * tetap dari i18n seperti halaman lain.
 */

export const GUIDE_GROUPS = ['utama', 'rencana', 'fokus', 'lainnya'] as const
export type GuideGroup = (typeof GUIDE_GROUPS)[number]

/**
 * `via` = fitur jalan tapi dikelola dari halaman lain (mis. Jadwal lewat Kalender),
 * `partial` = UI sudah ada tapi ada bagian yang belum selesai (mis. jurnal belum persist,
 * sinkronisasi antar perangkat belum tersambung),
 * `soon` = belum tersedia sama sekali.
 */
export type GuideStatus = 'ready' | 'via' | 'partial' | 'soon'

export interface GuideFeature {
  readonly id: string
  /** Kode PRD, mis. `F1`. */
  readonly code: `F${number}`
  readonly group: GuideGroup
  readonly title: string
  readonly status: GuideStatus
  readonly summary: string
  readonly tips: readonly [string, ...string[]]
  /** Halaman tujuan; `undefined` = tidak punya halaman sendiri. */
  readonly href?: string
}

const KALENDER_PATH = getFeature('kalender').path

export const GUIDE_FEATURES: readonly GuideFeature[] = [
  {
    id: 'daily',
    code: 'F12',
    group: 'utama',
    title: 'Daily',
    status: 'ready',
    summary:
      'Halaman utama yang menyatukan prioritas hari ini, to-do hari ini (termasuk yang telat), habit, cuaca, dan kalender hari ini. Widget di sini membaca data yang sama dengan halaman lain, jadi centang di sini ikut mengubah progres di sana.',
    tips: [
      'Tinggal tulis judulnya di quick add To-do: task dibuat tanpa deadline dan tetap tampil di To-do hari itu. Besok tidak berubah jadi terlambat, dan task tetap ada setelah reload sampai kamu selesaikan.',
      'Prioritas diambil dari kuadran Penting & Mendesak lebih dulu, lalu task urgent.',
      'Daftar panjang di Prioritas maupun To-do dilipat lewat tombol "Lihat N lagi", bukan dipotong. Progres dihitung dari seluruh item hari ini, bukan cuma yang tampil.',
      'Centang, langkah rutinitas, dan cuaca tersimpan per tanggal di perangkat ini, jadi tidak hilang setelah reload dan kembali bersih saat ganti hari.',
    ],
    href: APP_HOME_PATH,
  },
  {
    id: 'goals',
    code: 'F13',
    group: 'utama',
    title: 'Goals',
    status: 'ready',
    summary:
      'Target besar dipecah jadi chapter dengan periode sendiri, kategori, dan sampul. Goal, chapter, dan tautan itemnya tersimpan terenkripsi di perangkat ini, dan progres dihitung otomatis dari task, habit, serta jadwal yang kamu tautkan.',
    tips: [
      'Task, habit, dan jadwal punya pilihan "Untuk goal": tautkan ke Sepanjang goal atau salah satu chapter. Satu item hanya dihitung sekali, dan item yang dihapus tidak ikut menghapus goal.',
      'Chapter yang terlewat memunculkan kartu review dengan pilihan perpanjang, geser, atau tutup; tiap akhir pekan goal aktif juga ditanya. Jawabannya masuk jurnal dengan chip #goal.',
      'Progres goal muncul di Overview, dan tanggal target goal maupun akhir chapter ditandai di Kalender.',
      'Sampul goal memakai sticker dari koleksi yang sama dengan hiasan halaman, dan daftar goal bisa disaring per status.',
    ],
    href: getFeature('goals').path,
  },
  {
    id: 'calendar',
    code: 'F6',
    group: 'rencana',
    title: 'Kalender',
    status: 'ready',
    summary:
      'Kalender menampilkan jadwal (termasuk yang berulang), task ber-deadline, countdown, penanda tanggal target goal dan akhir chapter, serta ringkasan memo dan mood hari itu. Tampilannya bisa hari, pekan, atau bulan.',
    tips: [
      'Klik tanggal atau tombol tambah untuk membuat jadwal baru; klik kejadian untuk membuka detailnya.',
      'Jadwal berulang dihitung hanya untuk rentang yang sedang kamu lihat, jadi kalender tetap ringan.',
      'Di HP tampilan awalnya per hari karena tujuh kolom terlalu sempit; tetap bisa diganti ke pekan atau bulan.',
      'Panel hari menampilkan memo dan mood tanggal itu, lengkap dengan tautan ke jurnalnya.',
    ],
    href: KALENDER_PATH,
  },
  {
    id: 'countdown',
    code: 'F5',
    group: 'rencana',
    title: 'Countdown',
    status: 'ready',
    summary:
      'Hitung mundur ke tanggal penting: ujian, deadline, atau liburan. Satuannya menyesuaikan sendiri (bulan, hari, jam), dan momen yang sudah lewat masuk arsip.',
    tips: [
      'Tiga countdown terdekat juga muncul di Overview.',
      'Tanggal target countdown ikut tampil di Kalender.',
      'Momen yang sudah lewat bisa diarsipkan, bukan dihapus, jadi catatannya tetap ada.',
    ],
    href: getFeature('countdown').path,
  },
  {
    id: 'todo',
    code: 'F2',
    group: 'rencana',
    title: 'To-do',
    status: 'ready',
    summary:
      'Daftar task dengan judul, catatan, deadline, prioritas, dan tautan jadwal. Sisa waktu dihitung otomatis dari deadline, jadi kamu tahu mana yang mendesak.',
    tips: [
      'Filter dan urutan daftar cuma mengubah tampilan, bukan datanya.',
      'Task yang sama muncul di Daily, Eisenhower, dan Kalender; semuanya membaca data yang sama, bukan salinan.',
      'Task berprioritas urgent ikut masuk daftar Prioritas di Daily.',
    ],
    href: getFeature('to-do').path,
  },
  {
    id: 'eisenhower',
    code: 'F3',
    group: 'rencana',
    title: 'Eisenhower',
    status: 'ready',
    summary:
      'Matrix empat kuadran: Penting & Mendesak, Penting, Mendesak, dan sisanya. Cocok untuk memilah mana yang dikerjakan dulu dan mana yang bisa menunggu.',
    tips: [
      'Tarik task antar kuadran, atau pakai tombol tambah di kartu kuadran.',
      'Task tanpa kuadran tetap tersimpan di kolam; tidak ada yang hilang saat dipindah.',
      'Task di kuadran Penting & Mendesak otomatis menjadi prioritas di Daily.',
    ],
    href: getFeature('eisenhower').path,
  },
  {
    id: 'schedule',
    code: 'F1',
    group: 'rencana',
    title: 'Jadwal',
    status: 'via',
    summary:
      'Jadwal adalah blok waktu di Kalender: kuliah, meeting, olahraga, atau agenda apa pun. Atur jam, pengulangan, dan task yang tertaut. Jadwal tidak punya menu maupun halaman sendiri; semua dibuat dan diubah dari Kalender.',
    tips: [
      'Buat jadwal dari Kalender lewat tombol tambah, atau klik slot kosong di tampilan hari dan pekan.',
      'Pengulangan harian, pekanan, atau bulanan dihitung otomatis untuk rentang yang sedang tampil.',
      'Tautkan task ke jadwal supaya checklist-nya muncul di detail; tandai kejadian selesai atau hadir untuk mencatat kehadiranmu.',
    ],
    href: KALENDER_PATH,
  },
  {
    id: 'pomodoro',
    code: 'F4',
    group: 'fokus',
    title: 'Pomodoro',
    status: 'ready',
    summary:
      'Timer fokus 25 menit dengan jeda otomatis. Setiap sesi tercatat, jadi menit fokus hari ini bisa dilihat di halaman ini dan di Overview.',
    tips: [
      'Durasi fokus dan jeda bisa diatur di panel pengaturan.',
      'Riwayat sesi disimpan di perangkat ini dan dipakai untuk grafik fokus di Overview.',
      'Tombol Fokus di task atau Daily langsung menjadikan item itu target sesi, lalu membuka halaman Pomodoro.',
    ],
    href: getFeature('pomodoro').path,
  },
  {
    id: 'habit',
    code: 'F7',
    group: 'fokus',
    title: 'Habit',
    status: 'ready',
    summary:
      'Bangun kebiasaan harian, lihat streak, dan cek riwayat per bulan. Habit yang tidak dijadwalkan hari ini tidak merusak streak.',
    tips: [
      'Quick check dari Daily mencentang habit hari ini tanpa pindah halaman.',
      'Habit bisa ditautkan ke goal saat dibuat, dan capaiannya selama periode chapter ikut menghitung persentase goal.',
      'Hari yang tidak dijadwalkan tetap netral, jadi kamu tidak dihukum karena habit-nya memang tidak tiap hari.',
    ],
    href: getFeature('habit').path,
  },
  {
    id: 'journal',
    code: 'F8',
    group: 'fokus',
    title: 'Journal',
    status: 'ready',
    summary:
      'Jurnal harian berisi catatan bebas, mood, afirmasi, dan refleksi. Isi jurnal, judul, dan mood tersimpan terenkripsi di perangkat ini lewat penyimpanan lokal yang sama dengan fitur lain, jadi tetap ada setelah aplikasi ditutup.',
    tips: [
      'Tulis @ di editor untuk menyebut jadwal, atau # untuk menyebut goal dan chapter; keduanya jadi chip yang bisa diklik.',
      'Satu halaman per tanggal: menyimpan lagi di tanggal yang sama memperbarui halaman itu, bukan membuat salinan baru.',
      'Tulisan yang belum disimpan tetap tersimpan sebagai draf lokal dan dipulihkan saat kamu membuka tanggal itu lagi.',
      'Pencarian mencocokkan isi catatan, bukan cuma tanggal.',
    ],
    href: getFeature('memo').path,
  },
  {
    id: 'overview',
    code: 'F11',
    group: 'fokus',
    title: 'Overview',
    status: 'ready',
    summary:
      'Ringkasan angka dan grafik dalam lima rentang: keseluruhan, harian, pekanan, bulanan, dan tahunan. Ada menit fokus, streak habit, tren mood, progres goal, dan jadwal terdekat.',
    tips: [
      'Panah kiri dan kanan menggeser rentang; tombol rentang mengganti satuan waktunya.',
      'Agregasi dihitung di perangkat dari data lokal, bukan dikirim ke server.',
      'Angka yang berbeda antar rentang itu normal karena rentangnya memang berbeda.',
    ],
    href: getFeature('overview').path,
  },
  {
    id: 'guide',
    code: 'F9',
    group: 'lainnya',
    title: 'Panduan',
    status: 'ready',
    summary:
      'Halaman yang sedang kamu baca. Isinya penjelasan tiap fitur, cara backup, dan bagian "Gimana data lo dijaga".',
    tips: [
      'Daftar isi di samping bisa diklik langsung ke section yang dituju.',
      'Mulai dari bagian keamanan kalau kamu sedang bingung soal kunci atau pemulihan.',
      'FAQ di bawah menjawab pertanyaan yang paling sering muncul.',
    ],
  },
  {
    id: 'import-export',
    code: 'F10',
    group: 'lainnya',
    title: 'Import / Export',
    status: 'ready',
    summary:
      'Export membungkus seluruh data lokal ke satu berkas JSON yang bisa dibaca. Import menampilkan pratinjau lebih dulu, lalu menawarkan gabung dengan data sekarang atau ganti semua. Berkas export tidak terenkripsi, jadi simpan di tempat yang aman.',
    tips: [
      'Export dan import butuh kunci perangkat sudah terbuka. Kalau layar meminta pemulihan, buka dulu lewat halaman Akun.',
      'Berkas backup maksimal 32 MB. Berkas export berisi data terbaca (bukan terenkripsi), dan import menolak berkas yang lebih besar sebelum dibaca.',
      'Mode ganti semua harus dikonfirmasi dan baru menghapus data lama setelah berkas lolos validasi; berkas bermasalah ditolak lebih dulu.',
    ],
    href: getFeature('import-export').path,
  },
  {
    id: 'sticker',
    code: 'F14',
    group: 'lainnya',
    title: 'Sticker',
    status: 'via',
    summary:
      'Sticker dan hiasan halaman: tekan tombol Hias di pojok kanan bawah, pilih sticker, lalu geser, putar, atau ubah ukurannya. Hiasan disimpan per ukuran layar, jadi HP dan desktop punya susunan sendiri.',
    tips: [
      'Salin susunan dari ukuran layar lain lewat tombol salin di panel hias.',
      'Di luar mode hias, sticker tidak menangkap klik, jadi tombol di bawahnya tetap bisa dipakai.',
      'Maskot dan washi bawaan hanya muncul di gaya Cute dan Cute Putih; sticker tetap bisa dipakai di semua gaya.',
    ],
  },
  {
    id: 'account',
    code: 'F15',
    group: 'lainnya',
    title: 'Akun & perangkat',
    status: 'partial',
    summary:
      'Login tanpa password (email OTP atau Google), passkey sebagai pembuka utama, kode pemulihan, dan berkas terenkripsi kata sandi. Ada juga tambah perangkat lewat QR, daftar perangkat dengan logout jarak jauh, hapus akun permanen, dan indikator status sinkronisasi di shell. Yang belum: sinkronisasi otomatis antar perangkat, jadi indikator itu baru menunjukkan antrean perubahan di perangkat ini.',
    tips: [
      'Kalau email tidak bisa dibuka, tautan "Tidak bisa menerima kode?" di halaman login menawarkan passkey, kode pemulihan, atau berkas terenkripsi. Di perangkat yang belum punya sesi, masuk dulu atau tambahkan perangkat lewat QR.',
      'Tambah perangkat: perangkat baru menampilkan QR, perangkat lama memindainya, lalu QR balasan membawa kunci utama terenkripsi. QR berlaku 2 menit dan hanya bisa dipakai sekali.',
      'Hapus akun butuh konfirmasi email plus kode 6 digit; seluruh data di server dihapus permanen dan tindakan ini tidak bisa dibatalkan.',
      'Perangkat yang hilang bisa dicabut dari daftar perangkat. Indikator sinkronisasi menunjukkan perubahan yang masih menunggu dikirim, bukan data yang sudah sampai di perangkat lain.',
    ],
    href: getFeature('akun').path,
  },
  {
    id: 'appearance',
    code: 'F16',
    group: 'lainnya',
    title: 'Tampilan',
    status: 'ready',
    summary:
      'Menu Tampilan mengatur dua hal terpisah: tema warna (Kuning, Hijau, Ungu) dan gaya (Cute, Cute Putih, Kertas, Simpel, Elegan, Vintage, Tegas). Perubahan langsung terlihat tanpa reload.',
    tips: [
      'Tema dan gaya independen; kombinasinya tersimpan di perangkat ini, belum ikut akun.',
      'Buka menu Tampilan dari sidebar atau header Daily.',
      'Font gaya baru diunduh saat dipakai, jadi gaya default tetap ringan.',
    ],
  },
]

/** Anchor section di halaman. `panduan-` mencegah benturan dengan id lain. */
export function guideAnchor(id: string): string {
  return `panduan-${id}`
}

export function guideFeaturesInGroup(group: GuideGroup): GuideFeature[] {
  return GUIDE_FEATURES.filter((feature) => feature.group === group)
}

export const GUIDE_COPY = {
  eyebrow: 'Panduan',
  title: 'Panduan',
  lead: 'Semua fitur, cara backup, dan gimana datamu dijaga — dalam bahasa manusia, bukan dokumentasi teknis.',
  intro:
    'Panduan ini jujur soal status: tiap fitur diberi badge — siap dipakai, lewat halaman lain, sebagian, atau segera — sesuai kondisi kode saat ini.',
  tocLabel: 'Daftar isi',
  tocTop: 'Balik ke atas',
  status: {
    ready: 'Siap dipakai',
    via: 'Lewat halaman lain',
    partial: 'Sebagian',
    soon: 'Segera',
  },
  open: 'Buka halaman',
  faqTitle: 'FAQ',
  faqLead: 'Pertanyaan yang paling sering muncul soal data, kunci, dan fitur yang belum jadi.',
  groupLabel: {
    utama: 'Mulai dari sini',
    rencana: 'Rencana & jadwal',
    fokus: 'Fokus & refleksi',
    lainnya: 'Data, akun & tampilan',
  },
} as const

export interface GuideLayer {
  readonly title: string
  readonly body: string
}

export const GUIDE_SECURITY = {
  id: 'security',
  title: 'Gimana data lo dijaga',
  lead: 'Data disimpan lokal di perangkatmu dan dienkripsi dengan kunci yang cuma kamu pegang. Server tidak pernah menerima kunci utama dalam bentuk polos, jadi isinya tidak bisa dibaca dari sana.',
  layersTitle: 'Empat lapis pembuka',
  layers: [
    {
      title: 'Kunci utama',
      body: 'Kunci acak 32 byte per akun. Semua data dienkripsi dengan kunci ini, dan kunci ini tidak pernah dikirim ke server dalam bentuk polos.',
    },
    {
      title: 'Passkey (pembuka utama)',
      body: 'Sidik jari, Face ID, atau kunci keamanan. Envelope kuncinya dititip di server, tetapi PRF dari authenticator tidak pernah keluar dari perangkat.',
    },
    {
      title: 'Kode pemulihan',
      body: '24 kata plus envelope dalam satu teks yang diawali iprk1. Kamu tidak perlu menghafal apa pun: simpan kodenya di password manager atau cloud pribadi. Server tidak menyimpan kode ini.',
    },
    {
      title: 'Berkas terenkripsi kata sandi',
      body: 'Kode pemulihan yang dibungkus kata sandi pilihanmu (minimal 12 karakter). Aman ditaruh di flashdisk atau email, tetapi lupa kata sandi berarti berkasnya tidak bisa dibuka.',
    },
  ] satisfies readonly GuideLayer[],
  knowsTitle: 'Yang server tahu',
  knows: [
    'Email dan sesi login.',
    'Nama perangkat, waktu terakhir aktif, dan kota dari IP.',
    'Envelope passkey; data terenkripsi kalau sinkronisasi sudah aktif.',
  ],
  notKnowsTitle: 'Yang server nggak tahu',
  notKnows: [
    'Isi jadwal, task, jurnal, habit, goal, dan catatanmu.',
    'Kunci utama dan kode pemulihanmu.',
    'Kata sandi berkas cadanganmu.',
  ],
  recoveryTitle: 'Kalau harus buka di perangkat baru',
  recoverySteps: [
    'Login dengan OTP atau Google seperti biasa. Login hanya membuka sesi, bukan membuka data.',
    'Di layar "Buka datamu di perangkat ini", pilih passkey, tempel kode pemulihan, unggah berkas terenkripsi beserta kata sandinya, atau tambah perangkat lewat QR dari perangkat yang masih login.',
    'Lima kode salah membuat layar terkunci sekitar 5 menit. Setelah terbuka, perangkat ini punya pembuka kuncinya sendiri.',
  ],
  lost: 'Kalau passkey, kode pemulihan, dan berkas cadangan semuanya hilang, data tidak bisa dipulihkan. Tidak ada pintu belakang, termasuk dari tim kami.',
  soon: 'Tambah perangkat lewat QR sudah ada di halaman Akun dan layar pemulihan. Yang belum tersambung: sinkronisasi otomatis antar perangkat - data tetap tersimpan di perangkat masing-masing, dan indikator di shell baru menunjukkan antrean perubahan lokal.',
} as const

export const GUIDE_BACKUP = {
  id: 'backup',
  title: 'Backup & pindah data',
  lead: 'Ada dua hal berbeda: backup kunci (supaya data bisa dibuka) dan export data (supaya isinya bisa dibaca atau dipindah).',
  blocks: [
    {
      title: '1. Backup kunci — sudah ada',
      body: 'Buka halaman Akun, lalu kartu Backup kode pemulihan. Salin, unduh, atau bagikan kodenya lewat menu OS. Simpan di password manager. Kode ini membuka semua datamu, jadi jangan dikirim ke chat.',
    },
    {
      title: '2. Berkas terenkripsi kata sandi — sudah ada',
      body: 'Dari kartu yang sama, unduh berkas .json yang dikunci kata sandi minimal 12 karakter. Berkas ini bisa berdiri sendiri dan dibuka di layar pemulihan.',
    },
    {
      title: '3. Export & import data — sudah ada',
      body: 'Buka halaman Import / Export. Export mengunduh satu berkas JSON berisi seluruh data lokal; import memvalidasi berkasnya (maksimal 32 MB), menampilkan pratinjau, lalu menawarkan gabung atau ganti semua. Mode ganti semua harus dikonfirmasi. Keduanya butuh kunci perangkat sudah terbuka, dan berkas export berisi data terbaca, bukan terenkripsi.',
    },
  ] satisfies readonly GuideLayer[],
  warning:
    'Berkas export berisi data terbaca, bukan terenkripsi. Bedanya dengan kode pemulihan: kode itu justru alat untuk membuka kunci, sedangkan berkas export memuat isinya.',
} as const

export interface GuideFaqItem {
  readonly question: string
  readonly answer: string
}

export const GUIDE_FAQ: readonly GuideFaqItem[] = [
  {
    question: 'Apa bedanya OTP dan passkey?',
    answer:
      'OTP cuma untuk login dan membuat sesi. Passkey, kode pemulihan, atau berkas cadangan yang membuka kunci data. Jadi kehilangan akses email tidak otomatis berarti kehilangan data, selama salah satu pembuka kunci masih ada.',
  },
  {
    question: 'Server bisa baca data saya?',
    answer:
      'Tidak. Data dienkripsi di perangkat sebelum disimpan, dan server hanya memegang envelope passkey yang tidak bisa dibuka tanpa authenticator kamu. Sinkronisasi data terenkripsi belum tersambung di versi ini.',
  },
  {
    question: 'HP saya hilang. Data masih aman?',
    answer:
      'Selama kamu masih punya passkey yang tersinkron di iCloud Keychain atau Google Password Manager, atau masih menyimpan kode pemulihan, data bisa dibuka di perangkat baru. Cabut juga perangkat lama dari halaman Akun.',
  },
  {
    question: 'Lupa kode pemulihan, gimana?',
    answer:
      'Server tidak menyimpan salinannya, jadi tidak ada yang bisa mengirim ulang. Kalau passkey masih ada, pakai passkey. Kalau semua pembuka kunci hilang, data tidak bisa dipulihkan.',
  },
  {
    question: 'Kenapa diminta bikin passkey terus?',
    answer:
      'Passkey adalah pembuka utama dan cuma butuh satu tap. Tanpa pembuka kunci, data di perangkat ini tidak punya cadangan. Dialognya boleh dilewati hanya kalau perangkat tidak mendukung WebAuthn.',
  },
  {
    question: 'Aplikasinya bisa dipakai offline?',
    answer:
      'Bisa untuk data yang sudah ada di perangkat ini, karena penyimpanannya lokal dan kerangka aplikasi disimpan service worker. Login pertama dan pemulihan kunci tetap butuh jaringan.',
  },
  {
    question: 'Data antar perangkat sudah tersinkron?',
    answer:
      'Belum otomatis. Versi ini menyimpan data di perangkat masing-masing; yang sudah ada baru indikator antrean perubahan di shell, belum engine kirim-terima antar perangkat. Untuk pindah perangkat sekarang, tambahkan perangkat lewat QR supaya kuncinya ikut, atau pakai Export di perangkat lama lalu Import di perangkat baru. Berkas export berisi data terbaca, jadi simpan di tempat aman.',
  },
  {
    question: 'Kenapa Jadwal dan Sticker tidak punya halaman sendiri?',
    answer:
      'Jadwal dibuat dan diubah dari Kalender, sedangkan sticker dipasang lewat tombol Hias di setiap halaman. Keduanya tidak punya menu maupun halaman sendiri.',
  },
  {
    question: 'Ganti tema memengaruhi data?',
    answer:
      'Tidak. Tema dan gaya cuma mengubah tampilan, bukan isi atau kunci. Pilihannya tersimpan di perangkat ini dan belum ikut akun.',
  },
  {
    question: 'Apakah data tetap ada setelah reload?',
    answer:
      'Ya. Task, habit, jadwal, countdown, goal, sesi Pomodoro, dan jurnal (termasuk mood harian) tersimpan terenkripsi di perangkat ini, jadi semuanya tetap ada setelah reload atau aplikasi ditutup. Sync antar perangkat belum tersambung, dan berkas export sengaja tidak terenkripsi.',
  },
]
