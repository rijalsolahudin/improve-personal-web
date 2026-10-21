# Pilar Keamanan - Bersama (web + mobile)

Berlaku untuk semua app di monorepo. Detail teknis per app ada di `apps/<app>/.claude/rules/security.md`.

## Logging & data pribadi

- DILARANG: log token, cookie, password, header `Authorization`, atau body/response lengkap berisi PII.
- WAJIB: crash/analytics (Sentry, dsb.) scrub token & PII sebelum dikirim; DILARANG kirim data sensitif sebagai breadcrumb/tag.
- WAJIB: minimisasi PII sesuai UU PDP - kumpulkan hanya yang dipakai, dokumentasikan field sensitif.
- WAJIB: `console.*` tidak ikut build production. Cara strip-nya per app ada di rules app masing-masing.

## Dependency & supply chain

- WAJIB: lockfile di-commit; CI jalankan `npm audit --audit-level=high` (atau setara pnpm) - High/Critical = blocking.
- WAJIB: library/modul pihak ketiga (Nuxt module, library native) dicek maintainer, aktivitas, serta script/permission yang ditambahkannya sebelum ditambah.
- DILARANG: script `postinstall` asing tanpa review; `patch-package` yang mematikan pengecekan keamanan tanpa catatan alasan.
- WAJIB: secret (API key, client secret, private key, keystore) tidak pernah di-commit; `.env*` kecuali `.env.example` masuk `.gitignore`.
