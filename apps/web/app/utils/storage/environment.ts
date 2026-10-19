/**
 * Pemeriksaan syarat lingkungan sebelum mencoba membuka data lokal.
 *
 * Kenapa perlu, dan kenapa pesannya harus spesifik: kegagalan di sini membuat aplikasi tampak KOSONG
 * (daftar task hilang), dan pesan generik "data lokal tidak bisa dibuka" tidak memberi user atau kita
 * cara apa pun untuk tahu sebabnya. Padahal penyebabnya sering hal yang bisa diperbaiki sendiri:
 * halaman dibuka lewat `http://<IP-LAN>` (bukan `localhost`/HTTPS), mode privat, atau storage diblokir.
 *
 * Catatan penting soal konteks aman: `crypto.subtle` (WebCrypto) dan `navigator.locks` (Web Locks)
 * HANYA tersedia di secure context. `crypto.getRandomValues` dan IndexedDB tersedia di mana saja - jadi
 * aplikasi bisa "kelihatan jalan" (halaman terbuka, tombol bisa diklik) lalu gagal tepat saat kunci
 * dibuat. Itu jenis kegagalan yang paling membingungkan kalau tidak dijelaskan.
 *
 * Bentuknya dipisah dua: `readLocalEnvironment()` membaca global, `checkLocalDataEnvironment()` murni.
 * Pemisahan itu yang membuat syaratnya bisa diuji tanpa mengubah global test - sekaligus menghindari
 * fallback yang membuat "sengaja tidak ada" tidak bisa dinyatakan di test.
 */

/** Apa yang kebetulan tersedia di lingkungan ini. Semua field wajib: `undefined` berarti TIDAK ada. */
export type LocalEnvironmentProbe = {
  readonly isSecureContext: unknown
  readonly subtle: unknown
  readonly indexedDb: unknown
  readonly locks: unknown
}

export type LocalEnvironmentCheck = {
  readonly ok: boolean
  /** Sebab yang bisa dibaca manusia, lengkap dengan saran perbaikan. */
  readonly problems: readonly string[]
}

/** Pesan saran yang dipakai lebih dari satu sebab. */
const SECURE_CONTEXT_HINT =
  'buka lewat http://localhost:3001 atau HTTPS (WebCrypto & Web Locks hanya tersedia di konteks aman)'

/** Baca lingkungan nyata. Satu-satunya bagian modul ini yang menyentuh global. */
export function readLocalEnvironment(): LocalEnvironmentProbe {
  return {
    isSecureContext: globalThis.isSecureContext,
    subtle: globalThis.crypto?.subtle,
    indexedDb: globalThis.indexedDB,
    locks: (globalThis.navigator as { locks?: unknown } | undefined)?.locks,
  }
}

export function checkLocalDataEnvironment(probe: LocalEnvironmentProbe): LocalEnvironmentCheck {
  const problems: string[] = []

  if (probe.isSecureContext !== true) {
    problems.push(`konteks tidak aman: ${SECURE_CONTEXT_HINT}`)
  }

  if (probe.subtle === undefined) {
    problems.push(`WebCrypto (crypto.subtle) tidak tersedia: ${SECURE_CONTEXT_HINT}`)
  }

  if (probe.indexedDb === undefined) {
    problems.push(
      'IndexedDB tidak tersedia: periksa mode privat / pengaturan storage browser yang diblokir',
    )
  }

  if (probe.locks === undefined) {
    problems.push('Web Locks (navigator.locks) tidak tersedia: pakai browser yang lebih baru')
  }

  return { ok: problems.length === 0, problems }
}

/** Pesan error siap tampil: menyebut SEMUA syarat yang kurang, bukan hanya yang pertama. */
export function localEnvironmentError(problems: readonly string[]): Error {
  return new Error(`data lokal tidak bisa dibuka - ${problems.join('; ')}`)
}
