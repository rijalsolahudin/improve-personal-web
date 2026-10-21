# Shared code quality - web + mobile

Berlaku untuk semua app di monorepo. Struktur folder, tooling, dan penamaan spesifik ada di `apps/<app>/.claude/rules/code-quality.md`.

## Dead code & kebersihan

- DILARANG kode yang di-comment, fungsi/komponen/export/asset yang tidak dipakai, flag mati, `TODO` tanpa nomor issue.
- Hapus dependency & native module yang tidak dipakai (cek `knip`/`depcheck` atau sejenis bila tersedia).
- Magic number/string: ekstrak jadi konstanta bernama.
- Komentar menjelaskan "kenapa", bukan "apa".

## Log

- DILARANG `console.log` di kode yang di-merge. Pakai logger; `console.warn`/`console.error` hanya untuk error nyata.

## Testing (prinsip)

- Test menguji perilaku yang terlihat (output, emit, UI yang dirender), bukan detail implementasi.
- WAJIB test untuk logika reusable, utilitas murni, service, dan setiap bug fix (test regresi).
- Mock jaringan di batas (MSW / mock http client), bukan mock composable/hook internal.
- Coverage minimal 80% lines untuk logika reusable, utilitas, dan service.
- DILARANG `it.only`, `.skip`, atau test yang di-comment.

## Kontrak bersama

- DTO request/response, enum, dan skema validasi diambil dari `packages/contracts`; DILARANG mendefinisikan ulang tipe API di app.
- Perubahan kontrak WAJIB update web + mobile di PR yang sama, atau lewat versi API baru.
- Mobile harus toleran terhadap field tambahan (app lama masih beredar).
- Nama domain, field, dan pesan error konsisten lintas app (satu glosarium).
