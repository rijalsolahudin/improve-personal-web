import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'

import { AppText, BottomSheet, SegmentedControl, type SegmentOption } from '@/components/ui'

type QuickAddKind = 'tugas' | 'jurnal' | 'habit'

const KIND_OPTIONS: readonly SegmentOption<QuickAddKind>[] = [
  { value: 'tugas', label: 'Tugas' },
  { value: 'jurnal', label: 'Jurnal' },
  { value: 'habit', label: 'Habit' },
]

/** Kerangka F5 - form tambah cepat asli menyusul di F6. */
export function QuickAddScreen() {
  const router = useRouter()
  const [kind, setKind] = useState<QuickAddKind>('tugas')
  const handleClose = useCallback(() => router.back(), [router])

  return (
    <BottomSheet title="Tambah cepat" onClose={handleClose}>
      <SegmentedControl
        accessibilityLabel="Jenis entri"
        options={KIND_OPTIONS}
        value={kind}
        onChange={setKind}
      />
      <AppText tone="muted">Form tambah cepat menyusul.</AppText>
    </BottomSheet>
  )
}
