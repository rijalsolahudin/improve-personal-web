# QA report - #111 Sync pull: verifikasi dekripsi sebelum menimpa blob lokal + observe HLC setelah valid

## Verdict

**LULUS (re-check)** - BUG-1 sudah diperbaiki dan terbukti; lihat bagian Re-check. Putaran 1 sebelumnya: GAGAL (1 bug High, tombstone remote + `'keep'`); AC 1-6 lain lulus.

- Tier: T2
- Delta: `packages/core/src/sync/pull.ts`, `pull.race.test.ts`, `pull.unreadable.test.ts`
- Gate: `pnpm gate:delta --tier t2 --files <3 file delta>` -> PASS (4s): prettier, eslint, vitest (6 file / 36 test), typecheck
- Regresi: `pnpm gate:delta --tier t2 --files apps/web/app/utils/sync/controller.ts` -> PASS (28s, 24 file / 80 test).
  Catatan: run pertama FAIL (83 passed | 2 xfail, penyebab tidak tertangkap); diulang 2x PASS. Diduga flaky/perubahan konkuren di tree, tidak direproduksi.

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| 1. 'keep' + lokal ada: blob, HLC, index lama utuh | pass | `pull.unreadable.test.ts:85-108`; QA `HLC identik` lulus |
| 2. Tanpa lokal + 'keep': blob disimpan tanpa index | pass | `pull.unreadable.test.ts:110-127`; `controller.quarantine-*` hijau |
| 3. Cursor maju di transaksi yang sama walau halaman dilewati | pass | `pull.unreadable.test.ts:104-107` (cursor 7), `pull.ts:231-246` |
| 4. observe hanya valid / kalah dari lokal | pass | `pull.unreadable.test.ts:150-200` (urutan observe -> merge-transaction), `pull.ts:195-215` |
| 5. Perubahan test M3 sah | pass | diff `pull.race.test.ts`: `applied 1->0`, `skipped 1`, blob `'LAMA'` tetap; asersi index justru dipertahankan, bukan dilonggarkan; mencerminkan kontrak baru |
| 6. Tanpa it.only/.skip/console.log/dead code | pass | grep delta bersih; eslint PASS |

## Bug

| # | Severity | Ringkas | Reproduksi | Bukti |
| --- | --- | --- | --- | --- |
| 1 | High (FIXED, lihat Re-check) | Tombstone remote (`deleted=true`, HLC lebih baru) yang blob-nya tak terbaca (`'keep'`) DILEWATI saat record lokal ada; cursor tetap maju, jadi penghapusan sah tidak pernah diterapkan dan record "bangkit" permanen di perangkat ini | 1. Lokal: record hidup HLC `1699999999999-0-deviceb`. 2. Pull 1 halaman: tombstone `deleted:true` HLC `1700000005000-0-deviceb`, `indexFor => RECORD_INDEX_KEEP`. 3. `getRecord(id).deleted` | Expected `true`, actual `false`. `pull.ts:304-307` (`recheckCandidates`: `local !== null && KEEP => false`) tidak membedakan `remote.deleted`. Test: `pull.unreadable.qa.test.ts:75-81` (merah) |

Dampak: `buildIndex` (`apps/web/app/utils/sync/controller.ts:489-516`) mengembalikan `'keep'` untuk record karantina, kunci salah, dan skema lebih baru; semuanya kasus nyata untuk tombstone. Sebelum task ini tombstone itu diterapkan (flag `deleted` adalah metadata plaintext, tidak butuh dekripsi). Sesudahnya cursor melewati tombstone, jadi tidak diambil ulang walau app di-upgrade/kunci dipulihkan -> divergen antar perangkat (zombie data yang user sudah hapus). Bertentangan dengan klaim doc `pull.ts:38-41`.
Saran ke `bayu`/`dimas` (core): untuk `remote.deleted === true` jangan lewati karena `'keep'` (terapkan tombstone, index lama tidak disentuh / dihapus karena record sudah dihapus); `observe` untuk tombstone ikut ditimbang. Bagian ini keputusan desain developer.

## Tiga pilar

- **Keamanan:** menolak menimpa data lokal dengan blob tak terbaca benar; HLC dari blob tak terverifikasi tidak menarik jam lokal (mencegah lompatan jam) - lulus. Celah: bug #1.
- **Performa:** tidak ada perubahan jalur panas (satu `getRecords` tambahan sudah ada sebelumnya; tidak diukur, AC tidak menyebut angka).
- **Kerapian:** prettier/eslint/typecheck PASS; tidak ada dead code di delta.

## Sisa risiko / tidak diuji

- Test QA `packages/core/src/sync/pull.unreadable.qa.test.ts` (3 test): kini semua hijau (test bug #1 pada putaran 1 merah, dibiarkan tak diubah).
- Risiko desain (bukan bug AC): update remote non-tombstone yang di-skip karena `'keep'` (mis. skema lebih baru) juga tidak diambil ulang setelah app di-upgrade karena cursor sudah maju. Sesuai AC 1, tapi layak jadi task terpisah (mekanisme re-fetch/karantina).
- Tidak diuji: edit lokal yang mendarat di antara re-cek dan transaksi (sisa jendela yang diakui di doc `pull.ts`, butuh CAS di port); e2e, build, Lighthouse (T3).

## Re-check (putaran 2, hanya BUG-1, T2)

**Verdict: LULUS.** Fix di `pull.ts` (`recheckCandidates`, `indexToWrite`, `observe` tombstone `'keep'`) membuktikan bug tertutup, tanpa regresi.

| Butir | Hasil | Bukti |
| --- | --- | --- |
| Test merah `pull.unreadable.qa.test.ts:72-81` hijau tanpa diubah | pass | isi test tidak saya ubah (dibaca ulang, asersi sama); run hijau |
| Lokal hidup HLC lebih tua + tombstone `'keep'` | pass | `deleted=true`, HLC = remote, applied 1, cursor 9 |
| Lokal lebih baru | pass | lokal utuh (blob `LOKAL`, index tetap), skipped 1, cursor maju |
| HLC sama | pass | dilewati, lokal utuh, cursor maju |
| Tanpa lokal | pass | tombstone tersimpan, applied 1, cursor maju |
| Regresi AC1-AC4 | pass | `pull.unreadable.test.ts` (record hidup `'keep'` + lokal tidak ditimpa; observe tidak menggeser jam) hijau |
| Tombstone tidak masuk outbox, tanpa baris `record_index` yatim (memory adapter) | pass | `countOutbox()=0`, `listIndexByType` tanpa record itu |

- Test baru: `packages/core/src/sync/pull.unreadable.recheck.qa.test.ts` (4 test, 4 kasus LWW + outbox + index + cursor).
- `pnpm gate:delta --tier t2 --files <pull.ts, pull.race.test.ts, pull.unreadable.test.ts, pull.unreadable.qa.test.ts, pull.unreadable.recheck.qa.test.ts>` -> PASS (5s): prettier, eslint, vitest 8 file / 50 test, typecheck.
- `pnpm --filter @improve-personal/core exec vitest run` -> 25 file / 405 test PASS. `rtk proxy pnpm exec prettier --check` exit 0. Tanpa `.only`/`.skip`/`console.*`.
- Tidak diuji: adapter IndexedDB (hanya memory adapter), e2e/web controller (di luar scope re-check).
- Catatan (bukan bug, dampak tidak lebih besar dari yang dilaporkan dev): `observe` tombstone `'keep'` memakai HLC dari blob yang tidak terverifikasi (tetap tanpa batas drift, sudah diketahui); `reindexQuarantined` index yatim sudah diketahui.
