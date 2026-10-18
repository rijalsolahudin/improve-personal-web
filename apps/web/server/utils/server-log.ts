/**
 * Satu-satunya jalur log error server.
 *
 * security.md §11: dilarang mencatat token, cookie, OTP, header `Authorization`, atau body yang
 * memuat PII. `console.error(error)` mentah berbahaya karena objek error dari driver Postgres
 * membawa `query` + `parameters`, dan error dari request bisa membawa header.
 *
 * Karena itu yang dicatat hanya field yang sudah dipilih: rute, method, nama error, pesan, dan stack.
 * Stack berisi path berkas, bukan data user.
 */

type ErrorSummary = {
  readonly path: string
  readonly method: string
  readonly name: string
  readonly message: string
  readonly stack?: string
}

function summarize(event: H3Event | undefined, error: unknown): ErrorSummary {
  const normalized = error instanceof Error ? error : new Error(String(error))

  return {
    path: event ? getRequestURL(event).pathname : '(tanpa event)',
    method: event ? getMethod(event) : '-',
    name: normalized.name,
    message: normalized.message,
    stack: normalized.stack,
  }
}

/** Catat kegagalan server tanpa PII. Hanya dipanggil untuk kegagalan nyata, bukan 4xx biasa. */
export function logServerError(event: H3Event | undefined, error: unknown): void {
  console.error('[server] unhandled error', summarize(event, error))
}
