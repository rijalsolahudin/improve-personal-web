# QA report - #88 Hapus langkah rutinitas contoh (mock) di halaman Daily

## Verdict

**LULUS DENGAN CATATAN** - AC lulus semua; satu temuan UX non-blocking (di luar AC) perlu task terpisah.

- Tier: T2 (jalur data harian + persistensi)
- Delta: `app/composables/useDailyRoutine.ts`, `useDailyRoutine.test.ts`, `useDailyRoutine.persistence.qa.test.ts`; dihapus `app/composables/routine/mock.ts`
- Gate: `pnpm gate:delta --tier t2 --files ...` -> **PASS (43s)** - prettier 0s, eslint 3s, vitest 22s (5 file / 33 test), typecheck 18s
- Bukti tambahan: test QA sementara `useDailyRoutine.ac88.qa.test.ts` (5 test) -> 5 passed, file dihapus setelah run; 7 file daily -> **44 passed**

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| `createRoutineMock` + file mock dihapus; `steps` mulai `[]` | pass | `ls app/composables/routine` -> tidak ada; `git ls-files \| grep composables/routine` -> 0; `git grep -F "Minum segelas air"` -> 0 (stretching/beresin juga 0); test sementara: `useState('daily-routine').value.steps` -> `[]` |
| Blok "sekarang" tetap menampilkan jadwal hari ini | pass | test sementara seed 1 `Schedule` 08:00 blok pagi -> `currentBlock.total=1`, `nextItem.kind='schedule'`, `scheduleCount=1`; `useDailyRoutine.qa` + `dailyCalendar.qa` hijau |
| Tidak ada langkah hantu di blok/progres | pass | tanpa data: `progress={done:0,total:0,percent:0}` (bukan 8); dengan 1 jadwal: `{0,1,0}`; jadwal jam 19:00 tidak masuk blok pagi (`total=0`, `progress.total=1`) |
| Skema `doneSteps` dipertahankan; test menyuntik langkah sendiri | pass | `useDailyRoutine.ts:63` `steps: []`; `useDailyRoutine.test.ts:48-50`, `persistence.qa:114-116`; assertion `before + 1` tetap (diff `14a9d61`, tidak dilemahkan) |
| Centang langkah benar bila ada sumber data | pass | injeksi 1 `RoutineStep` -> toggle -> `currentBlock.done=1`; `ip-daily[hari].doneSteps=['qa-step']`; `clearNuxtState` + injeksi ulang -> `done=1`, `nextItem=null`, `steps` kembali `[]` |
| Data lama `ip-daily` aman | pass | seed `doneSteps:['id-lama']` + weather -> tidak throw, `steps=[]`, `done=0`, `progress {0,0,0}`, `doneSteps` lama tetap tersimpan; `storage rusak` test tetap hijau |
| Test daily routine hijau + gate/typecheck | pass | 7 file/44 test passed; gate T2 PASS 43s |

## Bug

Tidak ada bug blocking.

| # | Severity | Ringkas | Reproduksi | Bukti |
| --- | --- | --- | --- | --- |
| 1 | Low (UX, di luar AC) | Daily baru tanpa jadwal menampilkan "Blok ini beres semua. Mantap!" padahal belum ada item sama sekali; meta header "0/0 selesai" | 1. Kosongkan `ip-daily` + tanpa jadwal 2. Buka Daily di jam blok mana pun | `app/components/features/daily/DailyNowStrip.vue:62` (cabang `v-else` saat `total=0`, `nextItem=null`), copy `i18n/locales/id.json:166`; dulu tak terlihat karena mock selalu 8 langkah. Saran: state "belum ada langkah" terpisah + test strip. |

## Tiga pilar

- **Keamanan:** tidak tersentuh - tidak ada secret/endpoint/input baru; state hanya `RoutineStep[]` publik.
- **Performa:** tidak ada perubahan jalur panas; `itemsOf`/`progress` tetap satu pass atas 3 blok, dan kini memproses 0 langkah alih-alih 8 (lebih ringan). Tidak ada pengukuran angka karena AC tidak menuntut.
- **Kerapian:** gate prettier+eslint+typecheck PASS; tidak ada `any`/`@ts-ignore`/`eslint-disable`/`.only`/`.skip`/`console.log` baru (cek baris `+` diff `14a9d61`); komentar menyebut alasan ("halaman tidak boleh dibuka dengan pekerjaan orang lain", "yang bertahan adalah centangnya"), bukan narasi kode.

## Sisa risiko / tidak diuji

- Test sementara menguji composable, bukan mount halaman: strip/header tidak dirender, jadi temuan #1 berasal dari pembacaan template + state, bukan screenshot. E2E PWA = T3.
- Mekanisme langkah (`RoutineStep`, `kind:'step'`, `doneSteps`) masih hidup tanpa sumber data produksi - sengaja disisakan untuk kompatibilitas data lama; kandidat pemangkasan = task terpisah.
- `HabitForm.test.ts` gagal saat dijalankan sendiri = pre-existing #86, tidak dijalankan/dijadikan bukti di sini.
- Suite penuh, build, Lighthouse tidak dijalankan (aturan tier: hanya T3).
