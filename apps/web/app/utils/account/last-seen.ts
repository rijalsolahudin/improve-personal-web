const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
/** Lewat seminggu, "12 hari lalu" lebih sulit dibayangkan daripada tanggalnya. */
const RELATIVE_LIMIT_DAYS = 7

const relative = new Intl.RelativeTimeFormat('id', { numeric: 'auto' })
const calendar = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/**
 * "Login terakhir" perangkat dalam bahasa sehari-hari: "baru saja", "2 jam lalu", "kemarin", lalu
 * tanggal setelah seminggu. Waktu di masa depan (jam perangkat maju) dianggap "baru saja".
 */
export function formatLastSeen(iso: string, nowMs: number): string {
  const elapsed = nowMs - Date.parse(iso)

  if (elapsed < MINUTE_MS) return 'baru saja'
  if (elapsed < HOUR_MS) return relative.format(-Math.floor(elapsed / MINUTE_MS), 'minute')
  if (elapsed < DAY_MS) return relative.format(-Math.floor(elapsed / HOUR_MS), 'hour')

  const days = Math.floor(elapsed / DAY_MS)
  if (days < RELATIVE_LIMIT_DAYS) return relative.format(-days, 'day')

  return calendar.format(new Date(iso))
}
