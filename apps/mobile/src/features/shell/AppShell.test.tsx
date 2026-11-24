import { fireEvent, renderRouter, screen } from 'expo-router/testing-library'

// Relatif ke cwd Jest (apps/mobile) - turbo & `pnpm --filter` menjalankan dari sana.
const APP_DIR = './app'

describe('kerangka app (smoke)', () => {
  it('membuka Hari ini dengan dock 5 tab + FAB', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' })

    expect(screen.getByRole('header', { name: 'Halo!' })).toBeOnTheScreen()
    expect(screen.getByRole('tab', { name: 'Hari ini' })).toBeSelected()
    for (const label of ['Kalender', 'To-do', 'Jurnal', 'Lainnya']) {
      expect(screen.getByRole('tab', { name: label })).toBeOnTheScreen()
    }
    expect(screen.getByRole('button', { name: 'Tambah cepat' })).toBeOnTheScreen()
  })

  it('pindah tab lewat dock', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' })

    await fireEvent.press(screen.getByRole('tab', { name: 'Kalender' }))

    expect(screen).toHavePathname('/kalender')
    expect(screen.getByRole('tab', { name: 'Kalender' })).toBeSelected()
  })

  it('FAB membuka Quick add dan tombol tutup kembali', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' })

    await fireEvent.press(screen.getByRole('button', { name: 'Tambah cepat' }))
    expect(screen).toHavePathname('/quick-add')
    expect(screen.getByRole('header', { name: 'Tambah cepat' })).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Tutup' }))
    expect(screen).toHavePathname('/')
  })
})
