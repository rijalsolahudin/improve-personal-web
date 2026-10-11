/** Formatter tanggal/jam mengikuti locale aktif i18n (mis. `id-ID`). */
export function useDateFormat() {
  const { localeProperties } = useI18n()
  const language = computed(() => localeProperties.value.language ?? 'id-ID')

  function format(ms: number, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(language.value, options).format(ms)
  }

  return {
    /** "Kamis, 9 Oktober 2026" */
    longDate: (ms: number) =>
      format(ms, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    /** "Kamis, 9 Okt" */
    shortDate: (ms: number) => format(ms, { weekday: 'long', day: 'numeric', month: 'short' }),
    /** "21 Okt 2026" */
    dayMonthYear: (ms: number) => format(ms, { day: 'numeric', month: 'short', year: 'numeric' }),
    /** "Sen" */
    weekdayShort: (ms: number) => format(ms, { weekday: 'short' }),
    /** Nama hari pendek dari indeks 0 (Minggu) … 6 (Sabtu); 4 Okt 2026 = Minggu sebagai acuan. */
    weekdayOfIndex: (index: number) =>
      format(new Date(2026, 9, 4 + index).getTime(), { weekday: 'short' }),
    /** "Senin" */
    weekdayLong: (ms: number) => format(ms, { weekday: 'long' }),
    /** "9 Oktober" */
    dayMonthLong: (ms: number) => format(ms, { day: 'numeric', month: 'long' }),
    /** "Okt" */
    monthShort: (ms: number) => format(ms, { month: 'short' }),
    /** "Oktober 2026" */
    monthYear: (ms: number) => format(ms, { month: 'long', year: 'numeric' }),
    /** "9 Okt" */
    dayMonth: (ms: number) => format(ms, { day: 'numeric', month: 'short' }),
    /** "Sen, 9 Oktober 2026" */
    shortDateYear: (ms: number) =>
      format(ms, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }),
  }
}
