import { useState } from 'react'

import { AppText, Card, Chip, Row, Screen } from '@/components/ui'

type TodoFilter = 'semua' | 'hari-ini' | 'selesai'

const FILTERS: readonly { value: TodoFilter; label: string }[] = [
  { value: 'semua', label: 'Semua' },
  { value: 'hari-ini', label: 'Hari ini' },
  { value: 'selesai', label: 'Selesai' },
]

/** Kerangka F5 - daftar tugas asli (FlashList) menyusul di F6. */
export function TodoListScreen() {
  const [filter, setFilter] = useState<TodoFilter>('semua')

  return (
    <Screen eyebrow="Rencana" title="To-do">
      <Row isWrapping>
        {FILTERS.map((item) => (
          <Chip
            key={item.value}
            label={item.label}
            isActive={item.value === filter}
            onPress={() => setFilter(item.value)}
          />
        ))}
      </Row>
      <Card>
        <AppText tone="muted">Belum ada tugas.</AppText>
      </Card>
    </Screen>
  )
}
