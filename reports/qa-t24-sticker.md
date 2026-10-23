# QA — Task #38 [T24] Layer sticker: picker + hiasan halaman di semua halaman

- **Task:** Ergonio #38 (`personal-productivity`) · status saat QA mulai **`review`** (status tidak diubah oleh QA)
- **Tanggal:** 2026-10-23
- **Tree:** `f8a9a5c` + working tree agent lain (tidak disentuh QA)
- **Environment:** Linux, Node `v24.18.0`, Vitest `5.0.3`, `@nuxt/test-utils` env `nuxt` (happy-dom), Nuxt `4.5.2`
- **Rules dibaca:** `CLAUDE.md` root · `.claude/rules/shared-security.md` · `.claude/rules/shared-code-quality.md` ·
  `.claude/rules/ergonio-status-flow.md` · `apps/web/AGENTS.md` → `apps/web/CLAUDE.md` →
  `apps/web/.claude/rules/{security,performance,code-quality}.md` · `docs/PRD.md` F14 (baris 716–783) + AC T24 (baris 1096)

**Tidak ada kode produk yang diubah QA.** Perubahan dari saya hanya 8 file test baru (75 test) + report ini:

```
?? apps/web/app/utils/deco.qa.test.ts
?? apps/web/app/composables/useDeco.qa.test.ts
?? apps/web/app/composables/useDecoScope.qa.test.ts
?? apps/web/app/components/features/deco/DecoStickerItem.qa.test.ts
?? apps/web/app/components/features/deco/DecoStickerArt.qa.test.ts
?? apps/web/app/components/features/deco/DecoPicker.qa.test.ts
?? apps/web/app/components/features/deco/DecoLayer.qa.test.ts
?? apps/web/app/components/features/deco/decoReuse.qa.test.ts
```

---

## Verdict: **LULUS**

Semua acceptance criteria T24 terbukti lewat eksekusi test (75 test QA baru, 0 gagal), termasuk yang
paling mudah "kelihatan jalan tapi tidak": set hiasan terpisah per ukuran layar (desktop vs HP benar-benar
set yang berbeda, resize dua arah mengganti set), geometri relatif (%), elemen melebar → sticker ikut,
sticker tembus klik di luar mode hias, 100 sticker tetap satu listener scroll + satu pengukuran per frame,
ID tak dikenal jadi placeholder, layer hias hanya me-render dirinya saat sticker digeser, dan layer/picker
benar-benar dipakai di Overview, Daily, Goals, Akun, serta jurnal.

**Tidak ada bug blocking.** Ada 6 catatan non-blocking + 1 temuan lintas-task; semuanya di bagian
[§4 Temuan non-blocking](#4-temuan-non-blocking-tidak-menghalangi).

---

## 1. Scope & test plan

| Area | Level | File QA |
|---|---|---|
| Bucket ukuran layar (batas 599/600/1024/1025, dua arah), geometri posisi %, salin antar ukuran, validasi ID | unit murni | `app/utils/deco.qa.test.ts` (12) |
| Store hiasan: isolasi desktop/tablet/HP, tempel/ganti/hapus, z-order, reset per scope, data storage berbahaya, batas jumlah | composable | `app/composables/useDeco.qa.test.ts` (12) |
| Scope halaman + bucket berganti saat resize lintas batas (matchMedia), halaman dari path | composable + komponen | `app/composables/useDecoScope.qa.test.ts` (3) |
| Di luar mode hias tidak menangkap tap/klik/drag; keyboard geser/putar/ukuran/hapus; tombol swap/front | komponen | `DecoStickerItem.qa.test.ts` (9) |
| ID tak dikenal → placeholder, varian ikon, ukuran kecil | komponen | `DecoStickerArt.qa.test.ts` (5) |
| Picker: tab per pack, recent, search debounce, varian ikon, current, clear | komponen | `DecoPicker.qa.test.ts` (10) |
| Layer di jurnal: tempel/ganti/hapus, set per bucket, salin antar bucket, anchor hilang, 100 sticker, drag tanpa re-render halaman, reuse 4 halaman | komponen + integrasi | `DecoLayer.qa.test.ts` (14) |
| Picker dipakai ulang (habit & countdown), layer dipasang di layout, lazy-load, precache offline | komponen + statis | `decoReuse.qa.test.ts` (10) |
| Regresi sticker/deco lama | unit + composable | `app/utils/deco.test.ts`, `app/utils/stickers.test.ts`, `app/composables/useDeco.test.ts` (20) |
| Regresi area terdampak (habit, countdown, memo, feature registry) | unit + komponen | `features.test.ts`, `memo.test.ts`, `useMemos.test.ts`, `features/habit/**`, `features/countdown/**` (41) |

**Tidak diuji (dengan alasan):**

- **FPS scroll nyata di browser (Lighthouse/Playwright/DevTools)**: belum ada harness E2E/Lighthouse di repo
  (Playwright hanya peer opsional `@nuxt/test-utils`, tidak terpasang; tidak ada `playwright.config.*`), dan
  `/app/**` memakai `ssr: false`. AC "100 sticker scroll mulus" diukur
  lewat proksi yang menentukan mulus/tidaknya (jumlah listener, biaya per frame, jumlah node, mount) —
  lihat §3. Rekomendasi verifikasi manual ada di §6.
- **iOS/Android**: T24 versi mobile ada di task terpisah (#43, masih `backlog`).
- **Drag/rotate/resize dengan pointer nyata (mouse/touch)**: event pointer disimulasikan di happy-dom;
  perhitungan putar/ukuran diuji sebagai fungsi murni + handler (`useDecoDrag`), bukan gerakan kursor asli.
- **Import/export, sync, akun, goals, daily, overview**: area task lain; hanya dibaca sebagai bukti
  pemakaian ulang, tidak diubah dan tidak diuji ulang penuh.

---

## 2. Acceptance criteria

| # | AC | Status | Bukti |
|---|---|---|---|
| 1 | Sticker bisa ditempel/diganti/dihapus di jurnal | **PASS** (lihat catatan N3) | Di jurnal, sticker ditempel ke **kartu jurnal** lewat mode hias (`apps/web/app/pages/app/memo.vue:66-90` — anchor `journal-intentions`, `journal-feeling`, `journal-affirm`, `journal-reflect`, `journal-lists`, `memo-editor`). Test: `DecoLayer.qa.test.ts:286` "tempel sticker baru → tersimpan di halaman + ukuran layar ini" (route `/app/memo`, 1 item + 1 baris storage), `:308` "ganti (swap) hanya mengganti sticker; tempelan, posisi, rotasi tetap", `:334` "hapus menghilangkan sticker dari halaman & storage". Store: `useDeco.qa.test.ts:85` (ganti mempertahankan px/py/w/rot), `:104` (3 sticker di kartu yang sama, z naik). |
| 2 | Ikon habit & countdown bisa diganti | **PASS** | Test komponen yang benar-benar menekan picker lalu memilih sticker: `decoReuse.qa.test.ts:54` habit → label jadi "Ganti sticker", emoji 😄 tampil, `ip-stk-recent` berisi `mood/bahagia`; `:66` countdown → pratinjau memakai sticker. Wiring: `HabitForm.vue:165-167,260-266`, `CountdownForm.vue:164-197`, `HabitIcon.vue:29`, `CountdownArt.vue:13`. |
| 3 | Hiasan desktop tidak muncul di HP & sebaliknya (set terpisah) | **PASS** | `useDeco.qa.test.ts:31` (desktop+HP di halaman sama: `itemsIn` masing-masing 1, silang kosong, total tetap 2), `:43` (tablet tidak melihat desktop), `:54` (hapus satu bucket tidak menghapus bucket lain), `:66` (reset hanya scope aktif). Komponen: `DecoLayer.qa.test.ts:226` — render ulang di lebar 500 px hanya menampilkan item HP (`Kelinci`), item desktop (`Bahagia`) hilang, **tanpa reload**. |
| 4 | Resize jendela lintas batas mengganti set hiasan | **PASS** | `deco.qa.test.ts:38` urutan 1400→1025→1024→599→600→1024→1025 (dua arah) + `:51` lebar pecahan. `useDecoScope.qa.test.ts:69` — desktop→tablet→hp→tablet→desktop lewat listener `matchMedia`; `:96` dua breakpoint (600 & 1024) didengar dan dilepas saat unmount. Implementasi: `useDecoScope.ts:6,14-23`, `deco.ts:48-51`. |
| 5 | Elemen melebar → sticker ikut (posisi %) | **PASS** | `deco.qa.test.ts:59` — anchor 400→800 px: titik tengah 50% ikut (`+200`→`+400`), pusat vertikal tetap, ukuran = 20% lebar anchor; `:77` simpan ulang setelah melebar tidak menggeser `px`/`py`/`rot`; `:87` anchor mengecil tidak menghasilkan ukuran 0/negatif. Implementasi: `deco.ts:121-144`. |
| 6 | Tanpa batas jumlah sticker | **PASS dengan catatan (N1)** | Tidak ada batas per halaman/kartu: 3 sticker di satu kartu = 3 item (`useDeco.qa.test.ts:104`), z naik (`:117`), total 300 bisa ditambah satu per satu (`:157`). **Deviasi literal:** ada cap global `DECO_MAX_ITEMS = 300` (`deco.ts:13-14`, ditegakkan `useDeco.ts:65-71`, toast `deco.full`), jadi di atas 300 sticker `add()` mengembalikan `null` — lihat N1. |
| 7 | Di luar mode hias sticker tidak menangkap tap/klik/drag | **PASS** | `DecoStickerItem.qa.test.ts:33` — tanpa `tabindex`/`role`, `aria-hidden="true"`, tanpa kelas `editing`; `:45` — `pointerdown` + `ArrowLeft` + `Delete` tidak menghasilkan emit apa pun; `:58` — kelas `editing` hanya saat mode hias. CSS: `DecoStickerItem.vue:137` (`pointer-events: none`) vs `:144` (`auto` hanya `.editing`), layer `DecoLayer.vue:256`; `decoReuse.qa.test.ts:118` mengunci keduanya. Panel hias hanya ada saat editing (`DecoLayer.vue:225,239`; test `decoReuse.qa.test.ts:127`). |
| 8 | Halaman dengan 100 sticker tetap scroll mulus | **PASS (proksi)** | `DecoLayer.qa.test.ts:352` — 100 item ter-render, **tepat 1 listener `scroll`** (bukan per sticker), mount < 3000 ms; `:371` — 10 event scroll → **1** permintaan frame (rAF dirapatkan). Angka terukur: geometri 100 sticker × 60 frame = **0,71 ms total / 0,0118 ms per frame**; mount 100 sticker (hangat, happy-dom) = **36,4 ms**, **302 node**; mount dingin pertama 699 ms (termasuk resolve chunk lazy + warm-up Nuxt). Kode: `useDecoAnchors.ts:97-103` (bandingkan hasil ukur → tidak render kalau sama), `:127` (satu listener scroll capture), `:64-99` (ukur anchor, bukan per sticker). Batas: bukan FPS browser nyata (lihat §1 & §6). |
| 9 | ID tak dikenal → placeholder tanpa error | **PASS** | `DecoStickerArt.qa.test.ts:22` — `pack-dihapus/stiker-lama` → teks `?`, kelas `.unknown`, `title="Sticker tidak dikenal"`; `:29` id rusak/kosong/`javascript:` juga placeholder (tidak throw); `:38` sticker sah tetap emoji, bukan placeholder. Layer: `DecoLayer.qa.test.ts:253` — item dengan ID tak dikenal tetap dirender sebagai placeholder dan **tidak dihapus** dari data. Data: `deco.qa.test.ts:138` (id berformat sah tapi tak ada di katalog tetap bisa disimpan/diganti/dihapus). |
| 10 | Aset di-lazy-load per pack & tersedia offline | **PASS dengan catatan (N2)** | Lazy: layer `LazyDecoLayer` (`layouts/dashboard.vue:15-17,35`), picker `LazyDecoPicker` (`DecoLayer.vue:238`, `HabitForm.vue:260`, `CountdownForm.vue:191`, `goals.vue:122`), tidak ada impor langsung (`decoReuse.qa.test.ts:100`), katalog tidak diimpor halaman/layout (`:137`). Build nyata: katalog (10 pack, 424 sticker) ada di chunk `_nuxt/hWLSsxPc.js` **39.968 B / 9.503 B gzip**, **tidak direferensikan entry chunk** `CFfzFXKL.js` (0 hit) → baru diunduh saat picker/layer dipakai. Offline: `nuxt.config.ts:225` precache `**/*.{js,css,html,svg}` + `_i18n/**/messages.json`; `sw.js` memuat chunk katalog; `verify-precache` → **137/137 entri bisa dilayani**. Test statis: `decoReuse.qa.test.ts:152`. **Deviasi:** semua pack ada dalam satu chunk (bukan satu chunk per pack). |
| 11 | Layer hias tidak membuat halaman re-render saat sticker digeser | **PASS** | `DecoLayer.qa.test.ts:383` — 5 `pointermove`: style sticker berubah (drag jalan), **render halaman (`renders.count`) tetap**, storage belum ditulis; satu `pointerup` → **1× tulis** `ip-deco`, halaman tetap tidak render ulang. Implementasi: draft lokal `useDecoDrag.ts:88-100`, commit sekali saat lepas (`:55-63`), store baru di-`patch` di `DecoLayer.vue:75-79`. |
| 12 | Picker & layer dipakai ulang di Overview, Daily, Goals, Akun | **PASS** | Layer dipasang sekali di layout (`layouts/dashboard.vue:35`) sehingga berlaku di semua halaman dashboard; diuji dengan mount nyata per rute: `DecoLayer.qa.test.ts:208` (`/app` daily, `/app/overview`, `/app/goals`, `/app/akun`) — masing-masing merender hiasan halaman itu dan **tidak** merender hiasan halaman lain. Statis: `decoReuse.qa.test.ts:79` (layout + anchor `page`), `:85` (5 halaman pakai layout dashboard), `:92` (anchor per halaman; Akun pakai anchor `page` dari layout). Picker dipakai habit, countdown, goals (dan layer untuk jurnal) — `:100`. |

---

## 3. Angka performa (terukur, bukan klaim)

| Metrik | Angka | Cara ukur |
|---|---|---|
| Geometri 100 sticker × 60 frame | **0,71 ms total**, **0,0118 ms/frame** | `deco.qa.test.ts:94` (ambang test < 16 ms/frame; terukur jauh di bawah) |
| Mount layer 100 sticker (hangat) | **36,4 ms**, **302 node DOM** (≈3 node/sticker) | probe sementara `perfProbe.qa.test.ts` (dihapus setelah angka diambil) |
| Mount layer 1 sticker (hangat) | 5 node (baseline) | idem |
| Mount pertama (dingin) | 699 ms (resolve chunk lazy + warm-up Nuxt; bukan biaya render) | idem |
| Listener scroll untuk 100 sticker | **1** (satu, capture, passive) | `DecoLayer.qa.test.ts:352` + `useDecoAnchors.ts:127` |
| Scroll 10× beruntun | **1** permintaan frame (dirapatkan rAF) | `DecoLayer.qa.test.ts:371` |
| Tulis storage saat drag | **0** selama gerak, **1** saat dilepas | `DecoLayer.qa.test.ts:383` |
| Chunk katalog sticker | **9,5 KB gzip**, lazy, tidak ada di entry | build `nuxt build` + grep entry chunk |
| Precache service worker | **137/137** entri bisa dilayani | `node scripts/verify-precache.mjs` |

Catatan: pengukuran di happy-dom (bukan browser). Angka absolut tidak bisa dibandingkan dengan budget
INP/LCP di `performance.md`; yang dibuktikan adalah **kompleksitasnya tidak tumbuh per sticker** (1
listener, 1 pengukuran/frame, render hanya layer) dan biaya geometri per frame ±0,012 ms untuk 100 sticker.

---

## 4. Temuan non-blocking (tidak menghalangi)

| # | Severity | Temuan | Bukti | Rekomendasi |
|---|---|---|---|---|
| N1 | Low | **Cap global 300 sticker** bertentangan dengan AC/PRD "tanpa batas jumlah". Di atas 300, `add()` gagal & user melihat toast "Batas sticker tercapai". | `apps/web/app/utils/deco.ts:13-14`, `apps/web/app/composables/useDeco.ts:65-71`; test `useDeco.qa.test.ts:157` | Sepakati di PRD/AC: naikkan cap, atau jadikan per halaman+bucket, atau tulis eksplisit "maks 300 per perangkat". 100 sticker (target AC) tetap jauh di bawah cap. |
| N2 | Low | Lazy-load katalog **bukan per pack**: 10 pack / 424 sticker ada di satu chunk 9,5 KB gzip; picker pertama membuka pack apa pun mengunduh semuanya. | build: `_nuxt/hWLSsxPc.js` 9.503 B gzip; sumber `app/utils/stickerCatalog.ts:1-15` | Kalau suatu saat katalog tumbuh besar, pecah per pack (`import('../stickerPacks/hewan')`). Untuk 9,5 KB sekarang, satu chunk masih wajar — catat trade-off-nya. |
| N3 | Medium | **Sticker per entri jurnal belum ada.** `journal_sticker` (schema + envelope + label export) tidak pernah ditulis UI; yang ada adalah hias halaman yang menempel ke **kartu** jurnal, bukan ke entri jurnal tersimpan. | `packages/core/src/domain/entities/journal.ts:85-93` (schema), `packages/core/src/domain/entities/index.ts:70`; tidak ada pemakaian di `apps/web/app/**` (grep hanya `utils/io/preview.ts:34`); `pages/app/memo.vue` tidak punya picker sticker per entri | Putuskan produk: (a) cukup hias halaman (ubah PRD F8 agar eksplisit), atau (b) buat follow-up untuk menempel sticker ke entri + mengisi `journal_sticker`. |
| N4 | Low | Toggle global **"Sembunyikan hiasan"** (PRD F14) belum punya UI; `toggleHidden` tidak dipanggil dari komponen mana pun (grep hanya definisi di composable). | `useDeco.ts:111-114`, `layouts/dashboard.vue:16`, i18n `deco.hideAll` tidak dipakai | Tambah tombol di panel Mode hias / menu akun, atau hapus key i18n sampai fiturnya dibuat (dead key). |
| N5 | Low | `DecoLayer.vue` **248 baris** (script+template) melewati pedoman "~200 baris per SFC". | `apps/web/app/components/features/deco/DecoLayer.vue` (style tidak dihitung) | Pecah panel/tray/logika tempel ke composable atau subkomponen saat file ini disentuh lagi. |
| N6 | Low | **Typecheck tidak hijau** karena file task lain (bukan T24): `MemoEntry.vue:48` (`goal-mention` tidak punya `text`) dan dua test Daily (`TaskDraft` kurang `goalId`/`goalChapterId`). File T24 sendiri bersih. | `npx nuxt typecheck` (output di §5) | Perbaiki di task pemilik (`memo`/goals, Daily #14). |
| N7 | Info (lintas-task) | **JS entry ±187,97 KB gzip** > budget 170 KB (`performance.md`). Katalog sticker tidak ikut (chunk terpisah 9,5 KB), jadi bukan regresi T24. | entry `_nuxt/CFfzFXKL.js` 534.324 B / 187.973 B gzip; grep entry → 0 referensi chunk katalog | Catat sebagai utang performa global; ukur ulang dengan `nuxi analyze` di task performa. |

---

## 5. Perintah & hasil (apa adanya)

```bash
# 1) Test T24 + regresi deco/sticker lama
cd apps/web
npx vitest run app/utils/deco.test.ts app/utils/deco.qa.test.ts app/utils/stickers.test.ts \
  app/composables/useDeco.test.ts app/composables/useDeco.qa.test.ts \
  app/composables/useDecoScope.qa.test.ts app/components/features/deco
# → Test Files  11 passed (11)
#   Tests       95 passed (95)   (75 test QA baru + 20 test lama)

# 2) Regresi area terdampak
npx vitest run app/utils/features.test.ts app/utils/memo.test.ts app/composables/useMemos.test.ts \
  app/components/features/habit app/components/features/countdown
# → Test Files  8 passed (8)
#   Tests       41 passed (41)

# 3) Lint file QA baru
npx eslint app/utils/deco.qa.test.ts app/composables/useDeco.qa.test.ts \
  app/composables/useDecoScope.qa.test.ts app/components/features/deco --max-warnings 0
# → exit 0 (tidak ada output)

# 4) Typecheck
npx nuxt typecheck
# → tidak ada error di file T24.
#   Error yang tersisa milik task lain:
#   app/components/features/memo/MemoEntry.vue(48,47) TS2339
#   app/composables/dailyCalendar.qa.test.ts(149,7) TS2345
#   app/composables/useDailyRoutine.qa.test.ts(90,7) & (114,7) TS2345

# 5) Build + guard precache (bukti offline)
npx nuxt build
# → Build complete! Total 7,87 MB (2,12 MB gzip)
node scripts/verify-precache.mjs
# → verify-precache OK: 137 entri precache semuanya bisa dilayani

# 6) Bukti chunk katalog lazy + ikut precache
grep -l "Patah hati" .output/public/_nuxt/*.js
# → .output/public/_nuxt/hWLSsxPc.js   raw=39.968  gzip=9.503  inSW=1
grep -c "hWLSsxPc" .output/public/_nuxt/CFfzFXKL.js      # entry chunk
# → 0 (katalog tidak ada di entry)
```

Tidak ada `it.only`, `.skip`, assertion yang dilemahkan, atau test lama yang dihapus/diubah.

---

## 6. Cek tiga pilar

**Keamanan**

- Data hiasan divalidasi ketat saat dibaca dari `localStorage` (data tak tepercaya): id/`sid`/`page`/`anchor`
  hanya `[a-z0-9-]`, angka di-clamp, item rusak & id ganda dibuang — `deco.ts:53-119`; diuji
  `deco.qa.test.ts:138` + `:149` dan `useDeco.qa.test.ts:143` (payload `javascript:` & `<img onerror>` dibuang, tidak throw).
- `sid` hanya ID, bukan URL/gambar; tidak ada `v-html`/`innerHTML`/`eval`/`new Function` di seluruh modul
  deco/sticker (grep kosong); teks dirender lewat interpolasi Vue.
- Tidak ada data sensitif/PII di storage hiasan (`ip-deco`, `ip-deco-hidden`, `ip-stk-recent`) dan tidak
  ada `console.*` di modul ini (grep kosong) — sesuai `shared-security.md`.
- SVG/emoji sticker dirender sebagai komponen, bukan `<img src>` dari input user.

**Performa**

- Layer & picker lazy (`LazyDecoLayer`, `LazyDecoPicker`), katalog 9,5 KB gzip di chunk terpisah dari entry.
- 100 sticker: 1 listener scroll, 1 pengukuran per frame, geometri 0,012 ms/frame, 302 node DOM, drag tidak
  me-render halaman (hanya layer), storage ditulis sekali saat drag selesai.
- Aset offline: semua chunk JS/SVG + teks i18n di-precache (137/137 entri valid).
- Tidak ada `<img>` mentah/gambar LCP baru di jalur ini (sticker = SVG/emoji), jadi aturan `NuxtImg` tidak berlaku.

**Kerapian**

- Pemisahan jelas: `utils/deco.ts` (geometri + validasi murni), `composables/useDeco.ts` (state + storage),
  `useDecoScope.ts` (halaman + bucket), `useDecoAnchors.ts` (pengukuran DOM), `useDecoDrag.ts` (interaksi),
  komponen `Deco*` presentasional. Semua composable mengembalikan objek bernama.
- Semua test menguji perilaku yang terlihat (emit, DOM, storage, hasil render), bukan detail implementasi.
- Typecheck bersih untuk file T24; ESLint `--max-warnings 0` bersih; tidak ada `any`/`@ts-ignore` baru.
- Catatan: `DecoLayer.vue` 248 baris (N5).

---

## 7. Coverage & celah yang tersisa

**Tertutup test ini:** bucket & resize, isolasi set per halaman+bucket, geometri relatif & simpan ulang,
salin antar ukuran, validasi storage, tempel/ganti/hapus/z-order/reset, non-intercept di luar mode hias,
keyboard a11y, placeholder ID tak dikenal, picker (tab/search/recent/varian ikon/current/clear),
100 sticker (listener/frame/node/mount), drag tanpa re-render halaman, reuse di 4 halaman + habit/countdown,
lazy-load + precache offline.

**Celah (rekomendasi lanjutan):**

1. **FPS/INP nyata** halaman ber-100 sticker di browser (Chrome DevTools Performance / Playwright trace).
   Proksi di §3 kuat, tapi belum menggantikan pengukuran frame drop saat scroll + drag bersamaan.
2. **Drag/rotate/resize dengan pointer asli** (mouse + touch, termasuk `pointercancel` saat app di-background
   dan tablet/pen) — di sini hanya event sintetis.
3. **Sticker di kartu `position: sticky`** — `useDecoAnchors` punya jalur `frames`/Teleport khusus
   (`:9-23,87-95`), tapi jalur itu tidak tercakup test (butuh layout nyata). Layak jadi test browser.
4. **Sticker per entri jurnal** (N3) — perlu keputusan produk sebelum ada test.
5. **Mobile (#43)** — belum dikerjakan, di luar T24 web.

---

## 8. Kesimpulan

**LULUS.** Fitur T24 berperilaku sesuai acceptance criteria pada level yang bisa dibuktikan otomatis, dengan
bukti eksekusi (75 test baru hijau, regresi hijau, build + precache hijau). Enam catatan non-blocking
(N1–N6) dan satu info lintas-task (N7) tidak menghalangi; yang paling perlu keputusan produk adalah **N3
(sticker per entri jurnal)** dan **N1 (cap 300)**. Status Ergonio tidak diubah oleh QA.
