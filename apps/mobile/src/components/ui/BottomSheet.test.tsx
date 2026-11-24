import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { BackHandler, Text } from 'react-native'

import { ThemeProvider } from '@/providers/ThemeProvider'

import { BottomSheet } from './BottomSheet'

function renderSheet(onClose: () => void) {
  return render(
    <BottomSheet title="Tambah cepat" onClose={onClose}>
      <Text>Isi lembar</Text>
    </BottomSheet>,
    { wrapper: ThemeProvider },
  )
}

describe('BottomSheet', () => {
  it('menampilkan judul dan isi', async () => {
    await renderSheet(jest.fn())

    expect(screen.getByRole('header', { name: 'Tambah cepat' })).toBeOnTheScreen()
    expect(screen.getByText('Isi lembar')).toBeOnTheScreen()
  })

  it('tombol tutup memanggil onClose', async () => {
    const onClose = jest.fn()
    await renderSheet(onClose)

    await fireEvent.press(screen.getByRole('button', { name: 'Tutup' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('tombol back Android menutup lembar, bukan keluar layar', async () => {
    const addListener = jest.spyOn(BackHandler, 'addEventListener')
    const onClose = jest.fn()
    await renderSheet(onClose)

    const handler = addListener.mock.calls.at(-1)?.[1]
    let isHandled: boolean | undefined
    await act(() => {
      isHandled = handler?.({ type: 'hardwareBackPress', timeStamp: 0 })
    })

    expect(isHandled).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
    addListener.mockRestore()
  })
})
