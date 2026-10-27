# QA report - #114 Passkey: hardening WebAuthn PRF supaya envelope selalu bisa dibuka

## Verdict

**LULUS DENGAN CATATAN** - semua AC terbukti pada level mock. TIDAK diklaim teruji di authenticator nyata (lihat "Tidak terbukti"). Satu bug Medium di luar AC (tidak menggagalkan task, aturan status-flow #9).

- Tier: T2
- Delta: `apps/web/app/utils/crypto/webauthn.ts`, `passkey.ts`, `apps/web/app/composables/useAccount.ts`, `useKeyRecovery.ts`; test: `webauthn.test.ts`, `passkey.test.ts`, `useAccount.passkey.test.ts`
- Gate delta dev: `pnpm gate:delta --tier t2 --files <7 file>` -> PASS (21s): prettier, eslint, vitest 18 file / 91 test, typecheck
- Gate test QA baru: `pnpm gate:delta --tier t2 --files <3 file *.qa.test.ts>` -> PASS (22s), 16 test passed + 1 `it.fails`
- Regresi: `vitest run useKeyRecovery useLoginFlow.recovery utils/account utils/crypto useAccount` -> 21 file, 158 passed, 1 expected fail; `PasskeyOnboarding passkey-setup` -> 13 passed

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| 1 opsi UV/resident dikirim ke navigator.credentials | pass | `webauthn.test.ts` "meminta UV + discoverable WAJIB" (residentKey required, requireResidentKey true, UV required) + "autentikasi: UV WAJIB" |
| 2 user handle SHA-256 berkonteks, 32B, tanpa PII, exclude, InvalidStateError | pass | `webauthn.test.ts` handle stabil/32B; QA: `webauthn.qa.test.ts` handle == `sha256("ip-webauthn-user-handle:v1:"+id)` (terkunci) dan `user.id` tidak memuat email/nama/id mentah; "kredensial yang dikecualikan" pesan jelas |
| 3 fallback get() / PRF tak didukung ditolak | pass | `webauthn.test.ts`: enabled-only -> get() 1x salt sama + UV required, `isAssertion`; undefined/{}/enabled:false -> tolak, `get` tidak dipanggil, tanpa kunci cadangan |
| 4 createVerifiedPasskeyEnvelope round trip + zeroing | pass | `passkey.test.ts` (5 test); QA `passkey.qa.test.ts`: spy `sodium.memcmp` menangkap buffer hasil buka-kembali -> semua 0 pada sukses DAN pada mismatch (memcmp false -> PasskeyVerificationError); master key pemanggil utuh; PRF beda -> error tanpa `envelope` |
| 5 putEnvelope hanya setelah verifikasi | pass | `useAccount.passkey.test.ts` verifikasi gagal: 0 PUT, 0 tulis lokal; QA: get() dibatalkan, PUT server gagal -> tak ada tulis lokal; urutan PUT sebelum simpan lokal (`useAccount.ts:179-180`) |
| 6 useKeyRecovery tak berubah | pass | diff hanya buang `userId`/BRAND yang tak dipakai get() (`useKeyRecovery.ts:137`); `useKeyRecovery*.test.ts` hijau |
| 7 bersih it.only/.skip/console.log/dead code | pass | grep file delta: 0 temuan; `grep -rn createWebAuthnUserId .` (tanpa node_modules/.git/.nuxt/.output): 0 referensi |
| 8 batas bukti jujur | pass | header `webauthn.ts` + `webauthn.test.ts` menyatakan mock; lihat bawah |

## Bug

| # | Severity | Ringkas | Reproduksi | Bukti |
| --- | --- | --- | --- | --- |
| 1 | Medium (non-blocking, di luar AC) | Petunjuk lokal dengan `credentialId` bukan base64url valid membuat aktivasi passkey gagal permanen ("Invalid character"), padahal komentar produk menjanjikan "petunjuk rusak dianggap tidak ada". Retry tak pernah menolong; satu-satunya jalan keluar hapus data situs. | 1. keyStore berisi `passkey-webauthn` dengan `handle.credentialId = '!!rusak!!'` 2. `activatePasskey()` 3. Expected: aktivasi lanjut tanpa exclude, 1 PUT. Actual: `error = "Invalid character"`, create() tak dipanggil | `useAccount.ts:310-313` (`.catch` hanya menangkap `readPasskeyMaterial`, bukan `atob` di `webauthn.ts` `base64UrlToBytes`, dipanggil dari `createCredential`); test `useAccount.passkey.qa.test.ts` (`it.fails`) |

Pemilik fix: dimas. Saran: validasi/`try` base64 di `knownCredentialId` (jatuh ke `null`). Setelah fix, ubah `it.fails` jadi `it` di test tersebut.

## Celah yang dicek (hasil)

- get() fallback dibatalkan di tengah aktivasi: error merambat, `busy` false, `status=error`, 0 PUT, 0 tulis lokal. OK.
- userId sesi kosong: ditolak "id akun kosong" sebelum authenticator disentuh, `busy` false. OK.
- PUT sukses tapi `savePasskeyMaterial` gagal: error tampil, `busy` false, server memegang envelope baru, `has('passkey')` false. Aman untuk pemulihan karena `unlock.ts` memakai discoverable credential, bukan petunjuk lokal (`useKeyRecovery.ts:137`); akibatnya hanya UI menganggap "belum diatur" sampai aktivasi diulang. Penilaian: penjelasan developer benar.
- Error selain InvalidStateError (NotAllowedError) diteruskan apa adanya; PRF non-ArrayBuffer ditolak; PRF >32B dipotong; WebAuthn tak tersedia ditolak.

## Tiga pilar

- **Keamanan:** user handle tanpa PII, tak ada fallback ke kunci lemah, PRF tak dikirim/di-log, envelope lama aman bila verifikasi gagal. Salinan kunci di-zero (terbukti).
- **Performa:** tidak ada perubahan jalur panas; biaya tambahan 1 get() saat aktivasi (sekali, disengaja).
- **Kerapian:** prettier/eslint/typecheck PASS lewat gate; tidak ada dead code.

## Sisa risiko / tidak terbukti (semua pakai mock `navigator.credentials`)

- PRF create() == get() pada authenticator nyata, perilaku `prf.enabled` saat create, dan apakah get() fallback mengembalikan PRF yang sama.
- Discoverable credential benar-benar muncul di perangkat lain; `excludeCredentials` antar browser/pengelola passkey.
- Handle stabil berarti create() di authenticator yang sama MENIMPA passkey lama. `excludeCredentials` hanya melindungi bila petunjuk lokal ada; di perangkat tanpa petunjuk (passkey tersinkron), aktivasi yang gagal verifikasi dapat meninggalkan envelope server lama yang kredensialnya sudah tertimpa. Server utuh (terbukti), tapi bisa-dibuka-nya tidak terbukti tanpa authenticator nyata.
- Rekomendasi: Playwright + CDP virtual authenticator (`WebAuthn.addVirtualAuthenticator`, prf) di task T3/e2e; belum ada.
- File QA baru: `apps/web/app/utils/crypto/webauthn.qa.test.ts`, `passkey.qa.test.ts`, `apps/web/app/composables/useAccount.passkey.qa.test.ts`. Tidak ada commit, kode produk tidak diubah.
