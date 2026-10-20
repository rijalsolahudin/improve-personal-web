/**
 * Unduh teks sebagai berkas lewat object URL - isinya tidak pernah lewat server.
 *
 * URL langsung dicabut setelah klik: browser sudah memegang isi berkasnya saat unduhan dimulai.
 */
export function downloadTextFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
