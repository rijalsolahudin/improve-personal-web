import { fireEvent, render, screen } from '@testing-library/react-native'

import { ThemeProvider } from '@/providers/ThemeProvider'

import { SegmentedControl } from './SegmentedControl'

const OPTIONS = [
  { value: 'bulan', label: 'Bulan' },
  { value: 'minggu', label: 'Minggu' },
] as const

function renderControl(onChange: (value: 'bulan' | 'minggu') => void) {
  return render(
    <SegmentedControl
      accessibilityLabel="Tampilan kalender"
      options={OPTIONS}
      value="bulan"
      onChange={onChange}
    />,
    { wrapper: ThemeProvider },
  )
}

describe('SegmentedControl', () => {
  it('menandai segmen terpilih untuk pembaca layar', async () => {
    await renderControl(jest.fn())

    expect(screen.getByRole('tab', { name: 'Bulan' })).toBeSelected()
    expect(screen.getByRole('tab', { name: 'Minggu' })).not.toBeSelected()
  })

  it('melaporkan segmen yang dipilih', async () => {
    const onChange = jest.fn()
    await renderControl(onChange)

    await fireEvent.press(screen.getByRole('tab', { name: 'Minggu' }))

    expect(onChange).toHaveBeenCalledWith('minggu')
  })

  it('tidak memanggil onChange saat segmen aktif ditekan lagi', async () => {
    const onChange = jest.fn()
    await renderControl(onChange)

    await fireEvent.press(screen.getByRole('tab', { name: 'Bulan' }))

    expect(onChange).not.toHaveBeenCalled()
  })
})
