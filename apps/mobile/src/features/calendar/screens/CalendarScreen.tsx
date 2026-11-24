import { useState } from 'react'

import { AppText, Card, Screen, SegmentedControl, type SegmentOption } from '@/components/ui'

type CalendarView = 'bulan' | 'minggu' | 'hari'

const VIEW_OPTIONS: readonly SegmentOption<CalendarView>[] = [
  { value: 'bulan', label: 'Bulan' },
  { value: 'minggu', label: 'Minggu' },
  { value: 'hari', label: 'Hari' },
]

/** Kerangka F5 - grid kalender asli menyusul di F6. */
export function CalendarScreen() {
  const [view, setView] = useState<CalendarView>('bulan')

  return (
    <Screen eyebrow="Rencana" title="Kalender">
      <SegmentedControl
        accessibilityLabel="Tampilan kalender"
        options={VIEW_OPTIONS}
        value={view}
        onChange={setView}
      />
      <Card>
        <AppText tone="muted">Jadwal akan tampil di sini.</AppText>
      </Card>
    </Screen>
  )
}
