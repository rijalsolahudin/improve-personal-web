import { fireEvent, render, screen } from '@testing-library/react-native'

import { ThemeProvider } from '@/providers/ThemeProvider'

import { Dock, DockItem } from './Dock'
import { Fab } from './Fab'

describe('Dock + FAB', () => {
  it('menampilkan tab aktif dan meneruskan tekanan tab', async () => {
    const onPressCalendar = jest.fn()
    await render(
      <Dock accessibilityLabel="Navigasi utama">
        <DockItem label="Hari ini" icon="sun" color="#F7A21B" isFocused />
        <DockItem label="Kalender" icon="calendar-days" color="#F9D857" onPress={onPressCalendar} />
      </Dock>,
      { wrapper: ThemeProvider },
    )

    expect(screen.getByRole('tab', { name: 'Hari ini' })).toBeSelected()
    expect(screen.getByRole('tab', { name: 'Kalender' })).not.toBeSelected()

    await fireEvent.press(screen.getByRole('tab', { name: 'Kalender' }))
    expect(onPressCalendar).toHaveBeenCalledTimes(1)
  })

  it('FAB terpisah dari tab dan bisa ditekan', async () => {
    const onQuickAdd = jest.fn()
    await render(
      <Dock
        accessibilityLabel="Navigasi utama"
        trailing={<Fab accessibilityLabel="Tambah cepat" onPress={onQuickAdd} />}
      >
        <DockItem label="Hari ini" icon="sun" color="#F7A21B" isFocused />
      </Dock>,
      { wrapper: ThemeProvider },
    )

    expect(screen.queryByRole('tab', { name: 'Tambah cepat' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Tambah cepat' }))
    expect(onQuickAdd).toHaveBeenCalledTimes(1)
  })
})
