# Security review #120 — desain KID, registry kunci, blob record v2

**Tanggal:** 2026-10-26 · **Reviewer:** Arif (Security Engineer) · **Mode:** READ-ONLY, review DESAIN (tidak ada kode produk diubah, tidak ada tool Ergonio tulis)
**Objek:** `reports/spec-120-key-identity.md` (Yoga). Klaim spec dicek ke kode di working tree saat ini, termasuk perbaikan #111 di `packages/core/src/sync/pull.ts`.

**Verdict: LAYAK DIMULAI DENGAN PERUBAHAN WAJIB** — 0 Critical, 5 High, 6 Medium, 4 Low. Arah desainnya benar (KID dari MK, AAD kanonik, CAS di server, versi di dalam blob). Masalahnya: klaim "downgrade/rollback v1 tertutup" terlalu kuat, dan ada dua jalur rollout yang bisa menghilangkan data. S1 boleh mulai setelah §6 dari report ini masuk ke spec. Kalau tidak, format yang dikunci di S1 ikut terkunci bersama celahnya.

## 0. Pertanyaan terbuka

1. **Akun lama (v1, belum ber-KID) diklaim pemegang sesi yang tidak punya kunci (H2).** a) terima risikonya; b) klaim butuh step-up (OTP ulang) + notifikasi email + jalur ambil-alih yang bisa diverifikasi server. **Rekomendasi & asumsi: b.**
2. **Siapa sumber `v1CutoffMs` / `write` (H1, H3)?** a) server (TOFU, spec); b) konstanta yang dibakar ke build client, server hanya boleh *menurunkan*. **Rekomendasi & asumsi: b.**
3. **Re-seal massal record v1 dorman ke v2 (H1)?** a) tidak (spec); b) ya, job latar di F2 dengan HLC baru. **Rekomendasi & asumsi: b.** Tanpa ini, cutoff tidak melindungi record yang tidak pernah diedit lagi.
4. **Padding panjang plaintext di v2 (L3)?** Hanya murah dilakukan sekarang, selagi format belum dikunci. **Asumsi: ya, bucket 256 B.** Kalau PO menolak, catat sebagai trade-off.

## 1. Threat model singkat

Aset: MK/data key (di perangkat), isi record, integritas `hlc`/`deleted`, keberadaan record. Aktor: (A) server/DB jahat atau bocor; (B) pemegang sesi sah tanpa kunci (cookie dicuri, atau pemilik email/Google); (C) perangkat dicabut yang masih memegang MK; (D) client pra-R1 yang masih terbuka. Trust boundary: semua yang keluar dari server (registry KID, `recordFormat`, `v1CutoffMs`, metadata `hlc`/`deleted`, isi halaman pull) **tidak tepercaya**. Yang tepercaya hanya AEAD dengan kunci lokal dan state lokal yang monoton.

## 2. Jawaban per fokus

**F1 KID.** Aman. `crypto_kdf_derive_from_key` adalah BLAKE2b berkunci (PRF), jadi KID tidak membocorkan MK atau data key. Konteks `ip-keyid` beda dari `ip-data-` (`master-key.ts:37`). Turunan passkey memakai konteks `ip-passk` dengan kunci output PRF, bukan MK (`passkey.ts:41,107-112`), jadi tidak ada tabrakan. 16 B memberi second-preimage 2^128 dan birthday 2^64; tabrakan baru berarti kalau ada di satu akun, jadi cukup. Bocornya hanya korelasi: KID stabil seumur MK, ada di setiap blob, dan sama di dua akun kalau satu MK ditempel ke keduanya (Q4 menutup penyalahgunaannya, tapi server tetap bisa melihat korelasinya). Perlakukan KID sebagai pengenal pseudonim: jangan dikirim ke Sentry/analytics (L1). KID **bukan** bukti kepemilikan kunci. Siapa pun yang melihat satu blob tahu KID-nya, jadi server tidak boleh memperlakukan "kirim KID yang benar" sebagai autentikasi. Spec tidak melakukannya, tapi tulis eksplisit. Catatan implementasi: `session.ts:189-192` men-zero MK setelah data key diturunkan, jadi `deriveKid` harus dihitung sebelum `zeroKey` atau lewat `withMasterKey`.

**F2 CAS.** Benar secara semantik di Postgres READ COMMITTED: `INSERT .. ON CONFLICT DO NOTHING` menunggu baris konflik yang belum commit, jadi dua klaim tidak bisa sama-sama menang. Tapi klaim spec "satu pernyataan SQL" tidak tepat: INSERT lalu SELECT adalah dua statement (M5). Penyerang B bisa mengklaim lebih dulu pada akun **baru** (dampak: DoS onboarding, jalur keluar Q2) dan pada akun **lama v1 yang belum diklaim**. Kasus kedua yang serius (H2).

**F3 Blob v2/AAD.** Encoding AAD injektif: label panjang tetap + header tetap 20 B + UUID biner 16 B + u64/u32 BE + `len(u8)||devId`, dengan devId `^[a-z0-9]{1,64}$` (`hlc.ts:39,104-121`) dan counter <= 2^31-1 (`hlc.ts:36`). Field terakhir panjang tetap, jadi tidak ambigu. `userId` di AAD menutup replay antar akun. Nonce acak 24 B XChaCha aman. Overhead 60 B wajar. Prefix palsu tidak bisa membuat blob terbuka di cabang salah, **tapi bisa memilih keputusan**. Lihat M1. Downgrade **belum** tertutup: H1, H3.

**F4 Tombstone.** Tombstone v2 dengan KID sendiri terautentikasi lewat `deleted` di AAD. Membalik flag berarti `'reject'`, benar. Celahnya ada pada blob tanpa prefix (dianggap v1). Selama v1 masih diizinkan, server cukup mengirim sampah + `deleted=true` + HLC di atas versi lokal, dan #111 menerapkannya tanpa dekripsi (`pull.ts:227, 316-322`). Spec mengakui ini "dalam jendela", tapi jendelanya permanen untuk record dorman dan perangkat baru (H1). `'foreign'` tidak membuka jalur penghapusan; dampaknya setara withholding. Ada efek bayangan LWW (M3).

**F5 Rollout.** Ada tiga jalur data-loss: F3→write=1 (H4), pull pra-R1 melompati v2 (H5), dan baris yang ditulis v1 setelah F3 (M4). Upgrade outbox dengan HLC sama: push mengirim blob dari tabel record (`push.ts:104-108`) dan server menolak `compareHlc <= 0` sebagai `stale` (`server/services/sync.ts:172`). Kalau server sudah menyimpan HLC itu (ack hilang), hasilnya `stale` dan salinan v1 tetap di server. Itu bukan data-loss, karena isinya sama dan baris outbox resolved (`push.ts:191-199`). Tapi salinan itu menambah populasi v1 dorman (H1). Spec tidak menyebut kasus ini; tambahkan test-nya. HLC sama sudah pilihan yang benar, karena HLC baru akan mengubah upgrade jadi edit yang bisa mengalahkan edit sah perangkat lain.

**F6 Penyelamatan/QR.** Tidak ada jalur yang mengirim MK ke luar perangkat selain transfer yang sudah ada (sealed box ke public key ephemeral, `transfer.ts:1-24`). Ada tiga syarat: penukaran slot device harus atomik (M6), slot `legacy` harus diproteksi sama dengan `device`, dan payload QR perlu membawa `userId`+`kid` (L2). Jalur "RESCUE" pada 409 berbahaya kalau KID server ternyata milik penyerang (H2): UI bisa menggiring user me-reseal datanya ke kunci penyerang.

**F7 Server jahat — yang terlewat dari §7 spec.** Pertama, server mengontrol `recordFormat.write` dan `v1CutoffMs` (H3). Kedua, `409 SYNC_RESET_REQUIRED` memaksa full pull ulang (`pull.ts:172-183`), dan itu memperbesar permukaan H1 di perangkat lama. Ketiga, ukuran blob membocorkan panjang plaintext (L3). Keempat, HLC (wallMs + deviceId per edit) membocorkan pola aktivitas, tidak bisa dihindari dan cukup didokumentasikan. Withholding, penghapusan baris, dan rollback seluruh akun ke snapshot lama yang konsisten memang di luar scope; setuju, asal copy UI tidak mengklaim integritas tingkat akun.

## 3. Temuan (urut severity)

### H1 — Cutoff v1 tidak melindungi record dorman dan perangkat baru; tombstone #111 tetap bisa dipalsukan
**Lokasi:** spec §4 "Deteksi v1 vs v2" dan tabel keputusan; `pull.ts:227,316-322`; `provider.ts:90-103` (AAD v1 = `recordId` saja).
**Masalah:** HLC blob v1 **tidak terautentikasi**, jadi aturan "`hlc.wallMs > cutoff+7d` ditolak" bisa dilewati dengan memasang HLC apa pun <= cutoff+7d. Proteksi hanya berlaku untuk record yang versi sahnya sudah v2 dengan HLC > cutoff+7d. Record yang terakhir diedit sebelum F2 tetap v1 selamanya.
**Eksploit:** server memilih record dorman R (versi lokal HLC h < cutoff). Ia mengirim blob acak tanpa prefix, `deleted=true`, HLC = cutoff+6d. Keputusannya `'keep'` + tombstone, dan R terhapus di semua perangkat; perangkat baru bahkan tidak pernah melihat R. Varian: blob v1 lama yang sah dipasang dengan HLC baru, jadi rollback isi.
**Perbaikan:** (1) job re-seal latar di F2: setiap record v1 yang terbaca di-seal ulang ke v2 dengan HLC baru lewat `RecordWriter`, satu perangkat ber-`confirmedKid` per akun, idempoten, dan dibatasi per batch supaya tidak menabrak budget performa. (2) Setelah full pull menunjukkan 0 record v1 lokal, simpan flag sticky `v1Closed` per akun. Sejak itu blob tanpa prefix = `'reject'`, bukan `'keep'`. (3) Perbarui tabel §7 spec: "v1: masih bisa sampai re-seal selesai".
**Verifikasi:** test core: setelah `v1Closed`, tombstone tanpa prefix ber-HLC tinggi tidak menghapus record lokal dan cursor tetap maju. Fixture R dorman + tombstone palsu.

### H2 — Klaim retroaktif akun lama oleh pemegang sesi tanpa kunci = DoS permanen, berpotensi jebakan re-seal
**Lokasi:** spec §2.2 ("perangkat mana pun dengan sesi sah"), §2.3 cabang 409 → RESCUE, §3, Q2.
**Eksploit:** akun v1 aktif, KID belum diklaim (misalnya perangkat user offline saat R1 rilis). Penyerang B memakai sesi curian lalu `PUT identity {kid_X}`, dan dapat 201. Perangkat sah masuk cabang 409 + ada record lokal, lalu RESCUE, lalu diminta "kunci akun". Q2 tidak bisa dipakai karena akun punya record. Akibatnya sync terkunci permanen. Kalau UI/penyerang meyakinkan user memasang kunci X (misalnya lewat `iprk1` yang dikirim penyerang), semua data di-reseal ke kunci yang dipegang penyerang.
**Perbaikan:** (1) `PUT identity` pada akun yang sudah punya record atau envelope mewajibkan step-up (OTP ulang <= 10 menit, pola `deletion-otp`) dan mengirim email "kunci akun ditetapkan dari perangkat X". (2) Tambah jalur **ambil-alih yang bisa diverifikasi server**: KID aktif boleh di-retire dengan step-up kalau server menghitung **0 record yang header-nya ber-KID itu** (server bisa mem-parse header, spec §2.2.2), plus cooldown 24 jam yang bisa dibatalkan perangkat ber-`confirmedKid`. (3) RESCUE hanya boleh memasang KA yang KID-nya tercatat `created_by_device_id` milik perangkat yang **tidak** lebih baru dari perangkat ini, atau minimal tampilkan nama/tanggal perangkat pengklaim. Jangan pernah otomatis.
**Verifikasi:** test server: klaim tanpa step-up pada akun berisi record → 403; retire KID ber-0 record → sukses; KID dengan >= 1 record v2 → 409.

### H3 — `recordFormat.write` dan `v1CutoffMs` dari server diterima TOFU
**Lokasi:** spec §2.2 `GET /v1/keys/identity`, §4 ("Perangkat baru menerimanya secara TOFU").
**Masalah:** server jahat cukup menjawab `write:1, v1CutoffMs:null` selamanya. Akibatnya client terus menulis v1 (semua jaminan v2 hilang), dan perangkat baru/yang storage-nya dihapus menerima v1 tanpa batas. "Hanya boleh turun" tidak membantu kalau nilai awalnya tidak pernah datang.
**Perbaikan:** `write` sticky monoton di client (sekali 2, tidak pernah 1). Rilis client sesudah F3 membakar `V1_CUTOFF_MS` sebagai konstanta di `packages/contracts`, sehingga server hanya boleh menurunkannya. Begitu R2 rilis, `write=2` juga di-hardcode.
**Verifikasi:** test controller: jawaban server `write:1` setelah lokal `2` diabaikan. Perangkat baru dengan konstanta cutoff menolak v1 di atasnya walau server bilang `null`.

### H4 — Rollback F3→F2→`write=1` setelah cutoff dipublikasikan menghilangkan data
**Lokasi:** spec §5 "Rollback: F3->F2 dan F2->F1 cukup dengan mengubah flag server".
**Eksploit (operasional, bukan penyerang):** cutoff sudah sticky di perangkat. Ops mengembalikan `write=1`, lalu tulisan baru v1 ber-wallMs > cutoff+7d di-`'reject'` perangkat lain. Hasilnya divergensi diam-diam; record "hilang" di perangkat lain.
**Perbaikan:** tulis tegas: setelah `v1CutoffMs` dipublikasikan, `write=1` DILARANG (server menolak konfigurasi itu saat boot). Rollback hanya F2→F1 sebelum F3. Gabungkan dengan H3, karena client sticky membuat rollback flag tidak efektif. Jelaskan juga arti "jangan rollback client ke pra-R1" untuk web auto-update: deploy ulang build lama = SW meng-update user ke build lama. Jadi build pra-R1 harus dihapus dari pipeline deploy setelah F2, dan service worker wajib menolak versi < R1 (min-version check).

### H5 — Client pra-R1 yang masih terbuka di F2 memajukan cursor melewati record v2
**Lokasi:** spec §5 tabel F2 kolom pra-R1; `controller.ts:551-628` (karantina setelah 3 siklus, cursor maju); `pull.ts:316-322`.
**Masalah:** tab pra-R1 (IndexedDB yang sama dipakai bersama tab R1) mendapat v2, gagal buka, mengarantina, lalu cursor maju. Kalau versi lokal lama ada, versi v2 yang lebih baru di-skip. Setelah reload ke R1, cursor sudah lewat dan versi baru itu tidak pernah ditarik ulang. Spec hanya menutup push (426).
**Perbaikan:** di F2, **pull tanpa header `X-IP-Record-Format: 2` juga 426**. Client lama gagal tertutup di `pull.ts:186` tanpa memajukan cursor. Tambahan: boot R1 pertama kali menjalankan reset cursor sekali + bersihkan karantina (penanda epoch format lokal).
**Verifikasi:** test lintas versi: tab pra-R1 + v2 di server, cursor tidak berubah, lalu setelah R1 record v2 terbaca.

### M1 — Prefix bisa memilih keputusan pull; tabel keputusan harus berbasis (prefix, KID)
Blob ber-prefix + KID **sendiri** yang gagal autentikasi tidak boleh jatuh ke fallback v1, lalu `'keep'`, lalu tombstone #111. Peluang blob v1 asli kebetulan diawali magic+versi+KID sendiri adalah 2^-160, jadi fallback tidak perlu. Aturan: prefix+KID sendiri = v2 saja (gagal = `'reject'`); prefix+KID lain = coba v1 (2^-32), gagal = `'foreign'`; tanpa prefix = v1 sesuai H1. Test: blob sampah ber-prefix + KID sendiri + `deleted=true` tidak menghapus apa pun.

### M2 — `'reject'` membuang blob dan memajukan cursor
Bug AAD lintas platform (mobile T23) atau versi format berikutnya akan dibuang diam-diam per perangkat. Simpan sebagai karantina beralasan `tamper` (blob mentah, bukan plaintext) dengan hitungan di UI. Jangan pernah `observe`, jangan menimpa versi lokal.

### M3 — Blob tak terbaca tanpa versi lokal ikut LWW dan membayangi versi sah
`'keep'`/`'foreign'` tanpa lokal disimpan (`pull.ts:41-45`) dengan HLC dari server. Server memberi HLC sangat tinggi, sehingga versi sah berikutnya kalah `decideMerge` di perangkat itu selamanya. Perbaikan: record lokal yang tak terbaca kalah dari remote yang terbaca dan terautentikasi, apa pun HLC-nya (aturan di `recheckCandidates`/merge). Ini sudah ada sejak #111, tapi `'foreign'` memperluasnya.

### M4 — Tulisan v1 offline yang ter-push setelah F3 jadi `REJECTED` permanen
Spec hanya me-reseal outbox "saat start". Perangkat yang tetap terbuka melewati flip F2/F3 akan menulis v1, lalu ditolak server, lalu ditandai `OUTBOX_ERROR_REJECTED` (`push.ts:186-188`); data tinggal lokal. Re-seal harus dilakukan tepat sebelum setiap push (bukan hanya boot) setiap kali `write=2`. Selain itu, baris `REJECTED` yang blob-nya v1 boleh di-reseal ulang sekali. Kontrak hasil push tidak punya kode alasan dan tidak boleh ditambah (client lama `.strict()`).

### M5 — Detail CAS & skema
INSERT+SELECT adalah dua statement. Bungkus dalam satu transaksi dan tangani SELECT yang tidak menemukan baris aktif (misalnya bertabrakan dengan reset Q2): ulangi sekali, lalu `409`. Kalau `onConflictDoNothing` diberi target, predikatnya harus persis `WHERE status='active'` agar cocok dengan partial index; lebih aman tanpa target. Konflik PK `(user_id,kid)` dengan baris `retired` juga jatuh ke DO NOTHING; definisikan hasilnya. Postgres tidak punya `bytea(16)`: pakai `CHECK (octet_length(kid)=16)`. Guard `putEnvelope` (cek KID aktif + upsert) satu transaksi. `PUT`/`DELETE identity` memakai proteksi CSRF yang sama dengan route mutasi lain, dan rate limit `keys:identity` juga berlaku untuk `DELETE`. AC "20 PUT paralel" dijalankan di Postgres asli (harness `server/tests/helpers/harness`), bukan mock.

### M6 — Penukaran slot `device`→`legacy` harus atomik
`saveDeviceUnlock` sengaja menolak menimpa slot (`useDevicePairing.ts:215-219`). S7 butuh operasi "pindah KB ke legacy + pasang KA" dalam satu transaksi keystore di bawah writer lock; kalau tidak, crash di tengah bisa membuat KB hilang. `legacy` harus non-extractable/terbungkus sama seperti `device`, dan tidak boleh ada API umum "timpa slot device".

### Low
- **L1** KID adalah identifier pseudonim (UU PDP): jangan log/kirim ke Sentry, jangan muncul di URL.
- **L2** Payload transfer QR (`transfer.ts`) sebaiknya membawa `userId`+`kid` di dalam sealed message dan diverifikasi penerima, sebelum dan selain cek `deriveKid == kid server`. Envelope passkey baru sebaiknya ber-AAD `ip-envelope:passkey||userId||kid` (pembaca lama tetap didukung), karena `kdfParams.kid` itu plaintext yang bisa diubah server dan hanya petunjuk.
- **L3** Ukuran blob membocorkan panjang plaintext (jurnal). Padding bucket (`sodium.pad`, 256 B) di dalam ciphertext v2 tidak butuh header baru, tapi hanya bisa ditambahkan sekarang.
- **L4** Crash setelah `saveDeviceUnlock` sebelum klaim, lalu dibuka offline: sesi menulis dengan kunci belum terkonfirmasi. Tandai slot `pendingClaim`. Boleh menulis lokal (local-first), tapi UI harus jujur, dan kalau kalah klaim harus masuk RESCUE, bukan menghapus slot. Spec §2.3 "hapus slot device" hanya boleh kalau record + outbox = 0, dicek di bawah writer lock.

## 4. Rekomendasi Q1–Q6 spec
- **Q1 setuju b.** Tambahkan: layar menampilkan perangkat/tanggal pengklaim, dan tidak ada aksi destruktif sampai rescue selesai.
- **Q2 setuju b, tapi tidak cukup.** Penguasa email memang pemilik akun dalam model auth ini (ia juga bisa menghapus akun), jadi reset dengan OTP tidak menambah kuasa baru. Syarat "0 record + 0 envelope" aman tapi terlalu sempit untuk H2. Ganti jadi "0 record ber-header KID itu" + step-up + email + cooldown yang bisa dibatalkan perangkat ber-`confirmedKid`.
- **Q3 setuju b**, dengan copy jujur. Catat bahwa ancaman C (perangkat dicabut memegang MK + bisa memperoleh ciphertext) tetap terbuka.
- **Q4 setuju a.** Murah, dan menutup replay antar akun. Konsekuensinya: export/import wajib re-seal; tambahkan test import.
- **Q5 setuju b.** Telemetri hanya hitungan agregat per hari, tanpa userId/KID. "Grace 7 hari" bukan kontrol keamanan untuk v1 (HLC v1 tidak terautentikasi), hanya toleransi jam; tulis itu.
- **Q6 setuju b**, task terpisah. v2 justru mempermudahnya: tombstone v2 sah selalu terbaca, jadi isinya bisa dikosongkan nanti tanpa mengubah format.

## 5. Acceptance criteria keamanan tambahan
1. Tidak ada jalur di mana metadata server (`deleted`, `hlc`, `write`, `cutoff`, KID registry) mengubah/menghapus data lokal tanpa AEAD yang lolos, kecuali v1 sebelum `v1Closed`, dan itu terdokumentasi.
2. `write` dan cutoff monoton di client; konstanta build menang atas server.
3. F2 menolak push **dan pull** tanpa header format; build pra-R1 tidak bisa di-deploy ulang setelah F2.
4. Blob ber-prefix + KID sendiri tidak pernah memakai fallback v1.
5. Klaim/retire identitas pada akun berisi data butuh step-up + notifikasi; 20 klaim paralel di PG asli → tepat satu pemenang.
6. Penukaran slot S7 atomik; kill di setiap langkah tidak menghilangkan KB (spec §9.2 sudah ada, tambahkan langkah swap).

## 6. Perubahan spec yang WAJIB sebelum S1
1. Tabel keputusan §4 diganti versi (prefix, KID) dari M1, plus status `v1Closed` (H1).
2. Tambah job re-seal record v1 dorman di F2 + flag `v1Closed` sticky (H1); revisi tabel ancaman §7.
3. `recordFormat`/cutoff: sticky monoton + konstanta build (H3); larangan `write=1` setelah cutoff (H4).
4. F2: pull tanpa header → 426, plus reset cursor sekali di boot R1 (H5).
5. Klaim akun berisi data: step-up + jalur retire "0 record ber-KID" (H2/Q2).
6. Putuskan padding v2 (L3/Q4 report ini). Ini menyangkut layout yang dikunci S1 dan vektor emas.
M2–M6 cukup masuk AC sub-task S2/S3/S6/S7.

## 7. Batas verifikasi
Read-only, tanpa menjalankan sistem. Yang **tidak** saya verifikasi: (a) perilaku `onConflictDoNothing` + partial index di drizzle 0.45.4 terhadap Postgres sungguhan (ditulis dari semantik Postgres); (b) bahwa tab pra-R1 dan R1 benar-benar berbagi DB + cursor yang sama di produksi (diturunkan dari `localDatabaseName(userId)`); (c) alur UI/SW update dan apakah ada min-version check; (d) baris kode `useKeyRecovery.ts:123-140` dan `record-writer.ts:108-124,191-203` yang dikutip spec hanya dicek sekilas, tidak ditelusuri penuh.

## Putaran 2 (verifikasi revisi v2)
Lingkup: hanya H1, M5, H2/Q2, M6, H5, dan P1/P2 di spec v2. Read-only, tidak ada yang dijalankan.
**Verdict: aman dengan catatan.** Layout, AAD, dan padding S1 tidak tersentuh, jadi **S1 boleh mulai**. W1-W5 WAJIB masuk
spec/AC sebelum S2/S3/S4/S6/S7. Tidak ada Critical.

**1. Re-seal "HLC lama + 1" (H1): SETUJU, saran `hlc.now()` saya cabut.**
- LWW benar. `compareHlc` membandingkan tuple (`contracts/src/hlc.ts:211-223`), jadi `(w,c+1,dev)` > `(w,c,*)` dan push `applied` (`server/services/sync.ts:142`). Edit yang sudah meng-`observe` HLC lama selalu `>= c+2` (`core/src/sync/hlc.ts:68-96`).
- Masih bisa "menang palsu", tapi hanya untuk edit konkuren di milidetik yang sama: `(w,c,dX>dA)` atau `(w,c+1,dX<dev)`. Itu Low, cukup didokumentasikan.
  `now()` jauh lebih buruk, karena mengalahkan semua edit offline yang `wallMs`-nya lebih tua. HLC memang polos, jadi prediktabilitas bukan isu.
  Bedanya: di skema ini **server yang memilih HLC dasar**. Dua konsekuensi:
- **W1a (Medium):** server bisa menyajikan v1 ber-`wallMs=MAX_SAFE_INTEGER, counter=2^31-1`. Penerusnya ditolak `formatHlc` (`contracts/src/hlc.ts:190`),
  sehingga job macet terus dan `v1Closed` tidak pernah tercapai. Fix: kalau penerus tidak ada, record masuk karantina `tamper` dan tidak dihitung
  "v1 tersisa". Tambahkan test S4 dengan fixture HLC maksimum.
- **W1b (Medium, downgrade):** sebelum `v1Closed`, tabel §4.4 menerima v1 terbuka (di F2 cutoff masih `null`) walaupun lokal sudah punya v2 sah.
  Server cukup menyajikan konten lama dalam v1 dengan HLC di atas v2 lokal: LWW menggantinya, lalu job me-re-seal konten itu jadi v2 terautentikasi
  permanen. Celah ini juga ada kalau memakai `now()`. Fix: (S3) v1 masuk tidak pernah mengganti v2 lokal yang sah, hasilnya `'reject'` + karantina.
  (S2) di F2 server menolak push v1 di atas baris ber-`records.kid`. Client sah tetap pulih lewat re-seal-sekali M4 (`resealRetried`).
- `wallMs` masa depan dari server meracuni `observe`. Ini sudah ada sebelum #120 (tidak ada guard skew), jadi non-blocking: cukup telemetri hitungan saja.

**2. CAS dua statement (M5): benar di READ COMMITTED.** `DO NOTHING` tanpa target mencakup partial index dan PK. INSERT kedua menunggu
commit yang pertama, dan `SELECT` berikutnya memakai snapshot baru. `FOR UPDATE` tidak dibutuhkan untuk CAS itu sendiri.
- **W2a (Medium):** server tidak pernah menyetel `isolationLevel` (grep kosong), jadi RC berlaku hanya karena default PG. Di RR/SERIALIZABLE,
  `DO NOTHING` melempar `40001`. Fix: set `isolationLevel: 'read committed'` secara eksplisit, dan petakan `40001`/`40P01` ke retry-sekali.
- **W2b (Medium, write skew):** guard push v2 dan `putEnvelope` membaca "KID aktif" lalu menulis. Subquery `NOT EXISTS(records)` di finalisasi
  memakai snapshot statement, dan EvalPlanQual hanya memeriksa ulang baris target. Akibatnya record/envelope bisa lolos untuk KID yang baru di-retire.
  Fix: guard memakai `SELECT ... account_keys WHERE status='active' FOR SHARE`. Finalisasi: `SELECT ... FOR UPDATE`, lalu statement baru
  `EXISTS(records)`, baru `UPDATE`. Biayanya satu row lock bersama per transaksi push.

**3. Cooldown + pembatalan (H2/Q2): re-entrant aman** kalau keduanya `UPDATE` bersyarat (`status='active'` + kondisi `retire_after`) atas baris yang sama.
Row lock men-serialisasi keduanya, EPQ mengevaluasi ulang, dan tepat satu yang efektif.
- **W3a:** respons diturunkan dari `RETURNING`: batal setelah final = `409`, bukan `204`. Email hanya dikirim kalau `RETURNING` berisi baris
  **dan sesudah commit**, supaya GET paralel tidak mengirim email ganda dan rollback tidak mengirim email palsu. Finalisasi di `GET` bukan celah CSRF (hasilnya ditentukan waktu, bukan input).
- OTP `key_identity` sudah konsisten dengan pola yang ada: TTL 600 s (`contracts/src/auth.ts:28`), konsumsi atomik, 5 percobaan, cooldown per purpose (`otp.ts:55-75`).
  **W3b:** spec wajib menulis eksplisit `verified.userId === session.userId` (`account.ts:91`, karena `verifyOtp` memanggil `findOrCreateUserByEmail`)
  dan memasukkan `keys:identity` ke `USER_SCOPED` (`rate-limit.ts:63-71`).
- Low (task terpisah, sudah ada di `delete_account`): bucket `otp:email` dipakai bersama semua purpose, sehingga sesi curian bisa menghabiskan jatah OTP login.

**4. `swapDeviceToLegacy` di bawah `DEVICE_SLOT_LOCK_NAME` (M6): maknanya cocok** (lock itu menjaga mutasi slot device lintas tab), tapi mekanismenya belum ada.
- **W4a (High untuk S7):** port `SecureKeyStore` hanya punya `put`/`remove` per slot (`core/src/ports.ts:314-326`), dan `KEY_SLOTS_LOCAL` belum memuat
  `legacy` (`:286`). Spec menuntut "satu transaksi IDB" tanpa menyebut method-nya. Dua `put` berurutan bisa menghilangkan KB.
  Fix: method atomik baru (mis. `swap`) di port + `key-store.ts`, satu transaksi `durability:'strict'` (`key-store.ts:118`).
- **W4b:** Web Locks tidak re-entrant, jadi swap DILARANG memanggil `saveDeviceUnlock` di dalam lock (deadlock). Lock ini lock daun:
  tanpa lock lain, jaringan, atau kripto di dalamnya. Wrap KA dikerjakan sebelum lock (pola `device-slot.ts:184-187`).
  Di dalam lock, cek ulang bahwa slot masih KB lewat meta KID, dan batalkan kalau tab lain sudah swap. Tab lain yang memegang sesi KB di-lock/reload (broadcast).

**5. Reset via `formatEpoch` (H5): tidak bisa hilang.** Reset ganda hanya membuang bandwidth (pull idempoten), dengan syarat epoch dibaca ulang di dalam lock + transaksi.
- **W5a:** metadata karantina ada di `localStorage` (`utils/sync/quarantine.ts:14`), jadi tidak bisa ikut transaksi IDB.
  Urutan wajib: reset karantina dulu, baru IDB `{cursor=0, formatEpoch=2}`. Kalau dibalik, crash di tengah membuat karantina tidak dievaluasi ulang.
- **W5b (Medium):** reset hanya jalan saat boot. Kalau deploy rolling F1/F2 masih bercampur sesudah reset, tab pra-R1 yang mengenai instance F1
  bisa memajukan cursor melewati v2 lagi. Fix: jalankan reset juga saat transisi ke `write=2`, dan baca fase dari DB (`record_format_state`), bukan env per instance.

**6. P1/P2.** **P1 a+b boleh, dengan label jujur:** SW lama tidak bisa memveto SW baru, dan pra-R1 tidak punya pengecekan versi.
Jadi (a) hanya melindungi rollback R1 ke bawah (simpan build maksimum di IDB, stop sync kalau build turun). Penghalang pra-R1 yang nyata adalah (b) + `426`.
Ini anti-kecelakaan operator, bukan kontrol terhadap server jahat. **P2 a boleh asal ditambah batas byte (WAJIB):** 500 x 1 MB
(`contracts/src/sync.ts:62`) = 500 MB yang bisa diisi server untuk menghabiskan kuota record (jalur #108). Usul: batas total ~20 MB, dan
saat kuota penuh blob karantina yang dibuang (hitungannya tetap). Penggusuran "tertua" memungkinkan server menghapus bukti dengan cara membanjiri;
ini diterima dan dicatat. UU PDP: karantina ikut terhapus saat hapus akun/data lokal.

**Batas verifikasi:** semantik PG (EPQ, `DO NOTHING` di RR) dan Web Locks/IDB lintas tab dari dokumentasi, belum dijalankan; lokasi cursor (IDB) disimpulkan.

## Review S1 (format record v2)

**Tanggal:** 2026-10-27 · **Reviewer:** Arif · **Mode:** READ-ONLY. **Objek:** `packages/contracts/src/record-format.ts`, `record-format.test.ts`,
diff `index.ts`/`index.test.ts`, `package.json`. Bukti jalan: `pnpm exec vitest run src/record-format.test.ts` di `packages/contracts` -> 44/44 hijau.
**Verdict: LAYAK DIKUNCI** - 0 Critical, 0 High, 2 Medium, 4 Low. Tidak ada byte format yang perlu diubah. M1 (test saja) wajib masuk sebelum
T23/mobile memakai vektor; M2 adalah keputusan tabel S3, bukan perubahan layout. S3 boleh mulai sekarang; **S2 menunggu S1b** (lihat F7).

**Pertanyaan terbuka.** (1) Blob ber-magic `ipr` dengan versi tak dikenal (mis. `0x03` dari client masa depan): a) `null` -> jalur v1
(sekarang; setelah `v1Closed` jadi `'reject'`/karantina "tidak sah"); b) hasil terpisah "versi tak didukung" -> `'keep'` + minta update.
**Rekomendasi & asumsi: b** (M2). (2) Nilai `deleted` di AAD: **asumsi 0x00/0x01** sesuai kode; spec §4.2 cukup menulis "u8".

**F1 AAD injektif - YA.** Layout `record-format.ts:339-365` = label 9 B tetap || `0x00` || header 20 B || userId 16 || recordId 16 || u64 BE ||
u32 BE || `u8 len` || devId || `u8 deleted`. Satu-satunya field berpanjang variabel (devId) di-length-prefix. `parseHlc` menjamin devId
`[a-z0-9]{1,64}` (`hlc.ts:39,104-110,160`), jadi panjangnya muat u8 dan karakternya ASCII murni (`charCodeAt` aman). UUID: lowercase lalu
`UUID_PATTERN` (`protocol.ts:228`) lalu hex->16 B, bijektif untuk bentuk kanonik. wallMs <= 2^53-1 dipecah hi/lo u32 dengan tepat, dan sudah
diuji di `test.ts:327-333`; counter <= 2^31-1. Normalisasi (nol di depan, huruf besar, tanda hubung devId) sengaja memetakan HLC yang sama ke AAD
yang sama (AC S1). Domain separation ke v1 juga aman: AAD v1 = string `recordId` 36 B (`provider.ts:91-97`), sedangkan AAD v2 >= 77 B dan
berawalan `ip-record\0`. Jadi menempel atau mencopot header tidak bisa membuat blob terbuka di versi lain. Envelope memakai kunci lain + `ip-envelope:`.
**F2 KID - kanonik, satu KID = satu wire.** `decodeKid` (`:173-192`) menolak lewat regex, lalu encode-ulang harus sama persis. 22 char = 132 bit,
dan 4 bit sisa char terakhir harus nol (`'_…w'` untuk 0xff benar). Varian: base64url **tanpa padding** (RFC 4648 §5), identik dengan
`sodium.base64_variants.URLSAFE_NO_PADDING` (`test.ts:195`, 50 putaran). libsodium juga strict terhadap bit sisa. Beda varian dengan envelope/passkey/
transfer (`ORIGINAL`, `envelope.ts:43,60`, `passkey.ts:141,173`) disengaja, tapi rawan salah pakai: **L1** - S2/S4/T23 WAJIB memakai
`encodeKid`/`decodeKid`/`kidSchema` dari contracts, DILARANG `sodium.to_base64(kid, ORIGINAL)`. Test data key memakai `ip-data-`/id 1, sama dengan
`master-key.ts:37-40`, jadi vektor juga berlaku untuk provider produksi.
**F3 parser.** Tidak pernah throw untuk `Uint8Array` apa pun (`:245-259`, hanya cek panjang + 4 byte). Klaim kolisi **terverifikasi**
(`test.ts:265-271`): v1 = `nonce‖ct`, jadi P(nonce diawali `ipr\x02`) = 2^-32 per blob. Untuk 10^5 blob x 10^4 akun, nilainya ~0,2 kejadian
se-armada, jadi **realistis terjadi**, bukan teoretis. Penanganan di §4.4 benar: KID-nya hampir pasti "lain" (2^-128 untuk sama), lalu fallback v1
selama `!v1Closed`. Sesudah `v1Closed`, v1 memang ditolak, jadi tidak ada kerugian baru. **L2:** server S2 ("push v2 ber-KID asing -> rejected")
akan menolak push v1 sah yang kebetulan berkolisi, dan outbox mengulang blob yang sama. Fix: guard KID di server hanya untuk client ber-`write=2`,
**dan** writer v1 di S4 mengacak ulang nonce kalau 4 byte awalnya `ipr\x02` (nol biaya, menghapus ambiguitas untuk semua v1 baru).
DoS: AEAD atas sampah tidak lebih mahal daripada fallback v1 hari ini, dan penulis blob (server/sesi curian) sudah bisa memaksa itu. Bukan temuan.
**L3 (hardening):** blob v2 sah selalu `len >= 316` dan `(len-60) % 256 == 0`. Pakai predikat murah di provider -> `'reject'` sebelum AEAD,
tapi JANGAN di parser (kalau di parser, hasilnya `null` -> jalur v1 -> `'keep'`, lebih lemah dari `'reject'`).
**F4 batas plaintext - benar.** Dihitung ulang sendiri: `1_048_576 - 60 = 1_048_516`; `floor(/256) = 4095`; `4095*256 = 1_048_320`; `-1` (0x80)
= **1_048_319**. Cek: n=1_048_319 -> blob 1_048_380 <= batas; n=1_048_320 -> 1_048_636 > batas. Rumus `:79` cocok dengan `sodium.pad` untuk n=0..1100
(`test.ts:147-152`). `SEALED_RECORD_MAX_BLOB_BYTES` tetap 1_048_576 (`sync.ts:62`, `sync.ts` tidak ada diff). Batasnya byte mentah, bukan base64
(`SEALED_RECORD_MAX_BLOB_BASE64_LENGTH` diturunkan terpisah). Catatan S4: n = panjang **byte UTF-8** plaintext, bukan `string.length`.
**F5 vektor emas - benar-benar mengunci byte.** KID hex+wire di-pin (`test.ts:46-47,181-183`). AAD di-pin literal per field (`:49-59,276`), dan
saya cek wallMs `0x18bcfe5687b`. Blob 0 B di-pin penuh 316 B hex (`:443-453`), sedangkan 1/255/256/257/maks B di-pin lewat sha256 + panjang
(`:353-418`). Tukar kid<->nonce: offset literal `:103-106` dan `:426-428` merah, digest dan hex penuh merah. Tukar userId<->recordId: `AAD_HEX`
merah. Ganti terminator/label: `AAD_HEX` merah. Pembandingnya libsodium asli, bukan kode produk. **M1 (Medium, test saja):** nilai byte
`deleted=true` tidak di-pin. `:307-325` hanya cek "berbeda", jadi kalau encode `true` sebagai 0xff tidak ada test yang merah, padahal mobile
(T23) harus sama persis. Tambah satu `AAD_HEX` ber-`deleted:true` (byte terakhir `01`) + satu digest blob tombstone, dan tulis 0x00/0x01 di
spec §4.2. **L4:** vektor 1/255/256/257 hanya sha256. Itu cukup untuk mengunci, tapi ekspor vektor (input + hex) sebagai fixture JSON bersama
supaya T23 memakai file yang sama, bukan salin-tempel.
**F6 libsodium - aman.** `libsodium-wrappers-sumo@0.8.4` ada di `devDependencies` (`package.json`), runtime hanya `zod`.
`record-format.ts` tidak mengimpor libsodium; hanya test yang mengimpornya. Versinya sama dengan `apps/web`, jadi tidak ada paket baru di lockfile.
**F7 scope gap - benar ditunda, tapi itu bagian S1 menurut spec §6.** Baris S1 memuat DTO identity/retirement/otp, kode error,
`OTP_PURPOSES += key_identity`, ARCHITECTURE §6/§7/§14, dan `server.dbml`. Semua belum ada. Tidak ada satu pun yang menyentuh byte format/AAD/KID,
jadi format bisa dikunci tanpa itu. Tapi **S2 bergantung langsung** pada DTO, kode error 409/403, dan purpose OTP (`0007_otp_purpose.sql`),
jadi S2 WAJIB menunggu S1b; S3 tidak. Slot `V1_CUTOFF_MS = null` + grace 7 hari sudah ada (`:378-385`). Docs ARCHITECTURE ikut S1b.
**M2 (Medium, keputusan S3):** lihat pertanyaan terbuka (1). Parser mengembalikan `null` untuk `ipr\x03`, jadi client v2 yang sudah `v1Closed`
akan mengarantina blob format masa depan sebagai "tidak sah". Client v2 yang beredar tidak bisa diubah belakangan, jadi putuskan sekarang.
Fix tanpa ubah layout: export helper `hasRecordBlobMagic` (atau hasil `{kind:'unsupported_version'}`), dan tabel §4.4 menambah baris -> `'keep'`.

**AC keamanan tambahan untuk sub-task berikutnya:** (a) S3/S4: AAD saat open memakai KID dari header blob, dan kunci dipilih berdasarkan KID itu.
(b) S4: `isPlaintextWithinV2Limit` pada byte UTF-8 sebelum tulis lokal; `unpad` gagal -> `'reject'`. (c) S2: guard KID hanya untuk `write=2` (L2),
dan KID tidak pernah di-log. (d) T23: lulus semua vektor S1 + M1.

## Review S3 (core: blob-origin, pull v2)

**Tanggal:** 2026-10-27 · **Reviewer:** Arif · **Mode:** READ-ONLY, review bertarget atas implementasi + 2 penyimpangan. **Objek:** `packages/core/src/sync/{blob-origin,hlc,merge,pull}.ts`, `ports.ts`, test terkait.
**Verdict: WAJIB REVISI** - 0 Critical, 1 High, 1 Medium, 3 Low. Perbaikannya kecil dan lokal (blob-origin + urutan di pull). Tabel inti, W1a, W1b, dan jalur #111 benar.

**Pertanyaan terbuka.** (1) Hasil untuk "versi tak dikenal": a) tetap `'keep'` tapi tombstone-nya diblok di pull; b) dipetakan ke semantik `'foreign'`
(hidup = keep, tombstone tidak menimpa, tidak di-`observe`). **Rekomendasi & asumsi: b.** Ini meralat M2 saya (putaran S1): rekomendasi itu hanya
memikirkan record hidup, tidak memikirkan tombstone.

**H1 (High) - versi tak dikenal membuka jalan tombstone palsu, juga setelah `v1Closed`.** `blob-origin.ts:280-286` mengembalikan `'keep'` untuk magic
`ipr` + versi != 0x02, termasuk saat `v1Closed=true`. Di pull, tombstone `'keep'` diterapkan lewat LWW (`pull.ts:288-290` observe, `:416` tidak di-skip,
`:420` `decideMerge` tanpa bukti, `:453` index dihapus). Skenario: server/DB jahat mengirim `{deleted:true, hlc:<tinggi>, blob:"ipr\x03"+sampah}`.
Record lokal v2 yang sah terhapus, jam lokal ikut tertarik ke HLC palsu, dan `isDowngrade` (`pull.ts:277,410`) tidak menolong karena hanya mengecek
`accept`. Akibatnya AC S3 "setelah `v1Closed`, tombstone ber-HLC tinggi -> record lokal utuh" bisa diakali cukup dengan mengganti 1 byte. Jalur yang sama
juga mengubah blob v2 ber-KID sendiri yang dirusak dari `'reject'` (karantina) jadi `'keep'`. **Fix:** untuk `unknown-version`, hasilnya `'foreign'`
(sesudah fallback v1 gagal, dan langsung kalau `v1Closed`). Semantik foreign memang pas untuk "tidak bisa diverifikasi": record hidup tetap aman (M2
terpenuhi), tombstone tidak menimpa, tidak di-`observe`, dan disimpan `opaque` kalau belum ada versi lokal. **Verifikasi:** test pull baru:
`v1Closed=true`, lokal v2 hidup, remote tombstone `ipr\x03` ber-HLC `w+10^6` -> lokal utuh, `hlc.peek()` tidak berubah, cursor maju. Ditambah test
yang sama dengan `v1Closed=false`. Ubah `blob-origin.test.ts:376-395` (sekarang mengunci `'keep'`).

**M1 (Medium) - jendela balapan melebar karena `onReject` di-await setelah snapshot kedua.** Komentar `pull.ts:72-74` menyebut sisa jendelanya "beberapa
microtask tanpa kripto". Faktanya `onReject` (I/O IndexedDB, blob sampai 1 MB per record) dijalankan di antara `recheckCandidates` (`:302`) dan
`runTransaction` (`:324`), di `:314`. Edit lokal yang mendarat di jendela itu bisa ditimpa remote yang lebih tua, atau v1 bisa menimpa v2 (W1b bocor),
dan server bisa sengaja menyelipkan blob reject supaya jendelanya lebih lebar. Jadi klaim developer ("sisa risiko lama") **benar hanya untuk halaman
tanpa reject**. **Fix:** urutan `indexFor` -> kumpulkan reject snapshot-1 -> `onReject` -> `recheckCandidates` -> karantina `downgraded` -> transaksi.
Dengan begitu satu-satunya await di antara re-cek dan commit adalah karantina downgrade. Alternatif yang lebih bersih (S4): CAS/`getRecords` di dalam
`tx`. **Verifikasi:** test berisi `onReject` yang menulis record lokal ber-HLC lebih tinggi sebelum resolve -> record lokal harus menang.

**L1 - mengganti KID mengubah `'reject'` jadi `'foreign'`.** Ini menjawab fokus 1. Panjang dicek **sesudah** klasifikasi KID dan hanya untuk own/legacy
(`:288-301`). Logika itu benar: blob KID asing tidak bisa diverifikasi, dan fallback v1 butuh blob utuh. Blob ber-KID sendiri yang panjangnya salah
**tidak bisa** lolos jadi foreign tanpa mengubah byte KID. Kalau KID-nya diubah, hasilnya `'foreign'`: tidak menghapus, tidak menimpa, tidak di-`observe`.
Satu-satunya kerugian adalah bukti tamper tidak dikarantina. Ini diterima, cukup dicatat di §7.
**L2 - `opaque` juga dipasang untuk `'keep'` hasil `unsupported` (AEAD lolos, skema baru).** Akibatnya replay v2 sah yang LEBIH TUA menang atas versi
skema-baru yang autentik (`pull.ts:106-109,336`). Butuh server jahat, dan dampaknya hanya di perangkat yang belum pernah menyimpan record itu. Saran:
`opaque` hanya untuk `failed`/`foreign`/versi tak dikenal.
**L3 - throw tanpa `onReject` (`pull.ts:310-312`) tidak lewat `fail()`.** Status tidak di-patch dan pull macet di halaman itu. Desainnya fail-closed
dan **saya setuju itu bug penyambungan**: blob tidak hilang, cursor tidak maju (test `pull.v2.test.ts:191,435`). Guard `indexToWrite` `:448-450`
tidak terjangkau (`:298` + `downgraded` terpisah) dan aman sebagai invarian. Saran: shell S6 wajib menyambungkan `onReject` + test integrasi.

**Penyimpangan 1 (fallback v1 untuk versi tak dikenal) - AMAN, urutan benar.** Membuka sebagai v1 butuh kunci user + AAD `recordId`. Blob v3 asli dari
client masa depan pasti gagal AEAD v1 dan jatuh ke hasil default. Penyerang tidak bisa memaksa blob v3 sah "terbuka sebagai v1". Yang bisa ia lakukan
cuma me-replay blob v1 lama yang nonce-nya kebetulan `ipr`, dan kemampuan itu sudah ada lewat jalur tanpa prefix sebelum `v1Closed`. Kalau v1
terbuka, cutoff berlaku (`settleV1`) dan W1b menolak penimpaan v2 lokal (`peekBlobPrefix` -> `unknown-version` -> bukan v2 sah). Kalau urutannya
dibalik, fallback-nya tidak berguna. Catatan S4: perluas L2 (acak ulang nonce v1) dari `ipr\x02` ke semua awalan `ipr`. Hasil default jalur ini ikut H1.
**Penyimpangan 2 (W1a mengikuti spec §4.5) - SETUJU spec.** `(w,c+1,dev)` > `(w,c,*)` karena counter dibandingkan sebelum deviceId. `(w+1,0)` >
`(w,MAX)`. Overflow wall dijaga `hlc.ts:144` (`exhausted`) sebelum `formatHlc`. Ini konsisten dengan `bumpCounter` (`:59-66`). Brief "exhausted kalau
counter max" justru akan mengarantina record yang masih punya penerus sah.
**W1b (fokus 4):** cek ganda benar (`:277`, `:410`). Sisa jendela = M1.
**Regresi #111 (fokus 6) - aman.** Tanpa prefix + `!v1Closed` -> `openV1` -> gagal = `'keep'` (`:274-277`), sama seperti sebelumnya. Tombstone `'keep'`
tetap melewati `:416` dan masuk `decideMerge` dengan `incomingAuthenticated:false`, jadi cabang opaque (`merge.ts:81`) tidak pernah aktif untuk
remote tak terbukti. Snapshot-1 yang optimistis (`:258-260`) hanya menambah kandidat, tidak mengubah hasil. Tanpa `keyIdentity`, W1b mati.
**M3 / `opaque` (fokus 7) - tidak bisa disalahgunakan untuk downgrade saat ini.** `opaque` hanya dipasang saat lokal **tidak ada** (`:415-418`) atau
untuk tombstone `'keep'`. Rantai "sampah dulu lalu replay v2 lama" setara dengan server menahan versi terbaru: tidak ada kemampuan baru. Ini berlaku
setelah H1 diperbaiki. Sebelum itu, H1 sudah lebih buruk. **Bahaya laten S4:** flag yang lengket akan membuat replay v2 lama ber-HLC rendah menang atas
data sah yang lebih baru. AC S4: (a) setiap `putRecord` tanpa `opaque:true` (pull accept, writer put/delete, `resealAt`, import) WAJIB menghapus flag,
seperti `memory.ts:108-109`; (b) migrasi default = tidak ada. Kalau S4 belum mem-persist flag, M3 mati ke arah aman (LWW biasa), tetapi AC M3 belum
terpenuhi di produksi.

**Syarat kunci:** H1 + M1 diperbaiki, berikut test-nya, lalu re-check terbatas pada dua hal itu. S4 (writer/`resealAt`/padding) dan S6 (store karantina)
boleh mulai paralel karena tidak bergantung pada nilai hasil versi tak dikenal. Pemetaan verdict di shell S6 menunggu fix H1.

## Re-check H1+M1 (S3)

**Tanggal:** 2026-10-27 · **Reviewer:** Arif · **Mode:** READ-ONLY, terbatas pada H1 + M1 (+ efek samping L1). Suite tidak dijalankan ulang (gate 104 + full 470/470 sudah dari orchestrator).
**Verdict: H1 FIXED · M1 FIXED · S3 layak jadi dasar S4/S6 (boleh mulai).** Tidak ada perubahan wajib. Ada 1 catatan test (Low) dan 1 catatan forensik (Low).

**H1 - FIXED.** `blob-origin.ts:284-290`: `unknown-version` -> `'foreign'` langsung kalau `v1Closed`. Kalau tidak, `openV1` gagal -> `settleV1(..., RECORD_PULL_FOREIGN)`.
Kalau v1 terbuka (tabrakan nonce asli), hasilnya `accept` origin v1, lalu W1b di `pull.ts:279/434` menolak penimpaan v2 lokal. Penyerang tidak bisa
memaksa jalur ini tanpa kunci user. Di pull: `'foreign'` tidak di-`observe` (`pull.ts:290`). Kalau lokal ada, record dilewati apa pun `deleted`-nya
(`:441`). Kalau lokal tidak ada, `decideMerge(null, ...)` -> ditulis `opaque`, index `'keep'`/`null` (`:345,475`), jadi tidak hilang. `peekBlobPrefix:137`
konsisten dengan `classifyBlobPrefix:73`. Test `pull.v2.test.ts:275-340` memakai **jalur sungguhan** (`resolveBlobVerdict` + byte versi 0x03 dengan KID
sendiri, tombstone `FAR_FUTURE_HLC`), bukan stub verdict, dan mengunci: lokal v2 utuh, index utuh, `observe` kosong, `peek().wallMs` tetap, cursor
maju, untuk `v1Closed` true/false. Kasus hidup tanpa lokal -> `opaque:true`. `blob-origin.test.ts:387-395` mengunci "tidak pernah keep/reject"
untuk semua kombinasi v1Closed x cutoff. Skenario serangan asli tertutup.

**M1 - FIXED (deviasi loop diterima).**
1. *Terminasi:* `pending` berikutnya = `recheck.toApply`, yang merupakan subset `pending \ downgraded`, dan loop hanya berlanjut kalau `downgraded.length >= 1` (`pull.ts:316-324`).
   Jadi ukurannya turun ketat, paling banyak `|candidates|+1` putaran (dibatasi page limit). Server tidak bisa menambah putaran: putaran baru butuh
   tulisan v2 lokal yang konkuren, dan server tidak mengontrol itu. Tidak ada jalur infinite loop.
2. *Sisa jendela:* sesudah re-cek terakhir (`downgraded` kosong -> `break`) hanya ada hitungan sinkron (`:326-331`), lalu `runTransaction`. Tidak ada
   kripto, `onReject`, atau `indexFor` lagi. Yang tersisa: jeda antara `getRecords` di re-cek dan transaksi dibuka. Ini sesuai klaim dan komentar `:69-76`
   (CAS ditunda ke S4, tidak diklaim tertutup).
3. *Nyata, bukan pindah tempat:* `onReject` snapshot-1 sekarang berjalan **sebelum** snapshot yang memutuskan (`:298-301`). Karantina downgrade selalu
   diikuti re-cek ulang. I/O karantina (sampai 1 MB) keluar dari jendela, dan server tidak lagi bisa memperlebarnya dengan menyelipkan blob reject.
   Monotonisitas aman: record yang terbuang di satu putaran hanya bisa jadi `skip` (LWW lokal naik, atau lokal muncul untuk keep/foreign), tidak pernah
   terlewat secara salah.
   Test `:519-534` (edit selama `onReject` menang) dan `:536-556` (v2 mendarat selama `onReject` -> v1 dikarantina, `rejected:2`) membuktikan urutan baru.

**L4 (Low, test gap, non-blocking) - putaran ke-2 loop belum diuji.** Test `:558-576` berjudul "selama karantina downgrade", tapi downgrade-nya sudah
terlihat di snapshot-1 (lokal di-seed sebelum pull). Yang ia uji adalah karantina pra-re-cek, bukan karantina di dalam loop. Test `:489` dan `:536`
masuk loop, tetapi `pending` langsung kosong. Tidak ada test di mana edit lokal mendarat **selama karantina downgrade di dalam loop**, lalu tertangkap
oleh re-cek ulang. Logikanya benar menurut pembacaan kode. Saran test: halaman `[A v1, B v2 lama]`, `indexFor(A)` men-seed lokal v2 A (downgrade baru
terlihat di re-cek), lalu `onReject(A)` men-seed B ber-HLC tinggi. Harapannya B lokal utuh dan `getRecords` terpanggil 3x.

**L5 (Low, non-blocking) - tamper versi pada blob ber-KID sendiri -> `'foreign'`, bukan karantina.** Ini benar secara prinsip. Untuk versi != 0x02,
client ini tidak boleh menafsirkan offset 4..19 sebagai KID: layout v3 belum diketahui. Jadi "KID sendiri + versi diubah" tidak bisa dibedakan dari
blob sah client masa depan. Mengarantinanya sebagai tamper akan melanggar M2. Kerugiannya terbatas. Tanpa lokal, blob tetap tersimpan `opaque` (bukti
tetap ada). Dengan lokal, blob dilewati dan cursor maju (bukti hilang), tetapi dampak integritasnya nol: lokal utuh dan jam tidak tertarik.
Kemampuan penyerang sama dengan "server menahan update", yang memang sudah di luar model. Saran S6: shell mencatat metrik/log
`foreign` dengan alasan terpisah (`unknown_version` vs `other_kid`, tanpa isi blob) supaya lonjakan bisa dideteksi. Ini tidak perlu masuk store karantina.

**#111 tidak tersentuh fix ini.** `pull.unreadable.test.ts`, `pull.unreadable.qa.test.ts`, dan `pull.unreadable.recheck.qa.test.ts` (mtime 2026-10-26) serta
`pull.race.test.ts` (diff vs HEAD = penyesuaian #111 tgl 26, mtime 2026-10-26 16:15) semuanya lebih tua dari report S3 (2026-10-27 05:12) dan dari fix (05:14-05:16).
Jalur `none` + `!v1Closed` -> `settleV1(..., KEEP)` (`blob-origin.ts:278-281`) tidak berubah.
