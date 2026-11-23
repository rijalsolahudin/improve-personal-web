/**
 * Unduh isi sebagai berkas lewat object URL - isinya tidak pernah lewat server.
 *
 * URL langsung dicabut setelah klik: browser sudah memegang isi berkasnya saat unduhan dimulai.
 */
export function downloadFile(name: string, content: string | Uint8Array, type: string): void {
  const part = typeof content === 'string' ? content : new Uint8Array(content)
  const url = URL.createObjectURL(new Blob([part], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
