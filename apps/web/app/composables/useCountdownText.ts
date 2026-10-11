import { describeCountdown } from '~/utils/countdown'

/** Label sisa/lewat waktu momen: "2 bulan 10 hari lagi", "Sudah lewat 3 hari", "Baru saja lewat". */
export function useCountdownText() {
  const { t } = useI18n()

  return function countdownText(target: number, now: number): string {
    const left = describeCountdown(target, now)
    if (left.kind === 'justNow') return t('countdown.justNow')
    const text = left.parts
      .map(({ unit, value }) => t(`countdown.unit.${unit}`, { n: value }))
      .join(' ')
    return t(left.kind === 'past' ? 'countdown.past' : 'countdown.left', { text })
  }
}
