import { describeTimeLeft } from '~/utils/time'

/** Label sisa waktu deadline: "3 jam 12 menit lagi", "Terlambat 2 jam", "Tanpa deadline". */
export function useTimeLeft() {
  const { t } = useI18n()

  return function formatTimeLeft(deadline: number | null, now: number): string {
    const result = describeTimeLeft(deadline, now)
    if (result.kind === 'none') return t('time.noDeadline')
    const text = result.parts
      .map(({ unit, value }) => t(`time.unit.${unit}`, { n: value }))
      .join(' ')
    return t(`time.${result.kind}`, { text })
  }
}
