import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import DecoStickerItem from './DecoStickerItem.vue'

const BOX = { left: 120, top: 64, size: 96, rot: 10 }

let mounted: VueWrapper | null = null

async function mountItem(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  mounted = await mountSuspended(DecoStickerItem, {
    props: {
      sid: 'mood/bahagia',
      box: BOX,
      z: 4,
      isEditing: false,
      isSelected: false,
      ...props,
    },
  })
  await flushPromises()
  return mounted
}

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('QA T24 · di luar mode hias sticker tidak menangkap tap/klik/drag', () => {
  it('tidak fokusable, tidak punya role tombol, disembunyikan dari pembaca layar', async () => {
    const wrapper = await mountItem()
    const item = wrapper.get('[data-deco-item]')

    expect(item.attributes('tabindex')).toBeUndefined()
    expect(item.attributes('role')).toBeUndefined()
    expect(item.attributes('aria-label')).toBeUndefined()
    expect(item.attributes('aria-hidden')).toBe('true')
    // Kelas `editing` yang mengaktifkan pointer-events tidak dipasang.
    expect(item.classes()).not.toContain('editing')
  })

  it('pointerdown & keyboard tidak menghasilkan aksi apa pun', async () => {
    const wrapper = await mountItem()
    const item = wrapper.get('[data-deco-item]')

    await item.trigger('pointerdown')
    await item.trigger('keydown', { key: 'ArrowLeft' })
    await item.trigger('keydown', { key: 'Delete' })

    expect(wrapper.emitted('drag')).toBeUndefined()
    expect(wrapper.emitted('nudge')).toBeUndefined()
    expect(wrapper.emitted('remove')).toBeUndefined()
  })

  it('CSS: pointer-events mati saat tidak mengedit, hidup hanya saat editing', async () => {
    const wrapper = await mountItem()
    expect(wrapper.classes()).not.toContain('editing')

    await wrapper.setProps({ isEditing: true })
    expect(wrapper.classes()).toContain('editing')
  })
})

describe('QA T24 · mode hias: geser, putar, ubah ukuran, hapus, ganti', () => {
  it('bisa difokus keyboard & digeser dengan tombol panah', async () => {
    const wrapper = await mountItem({ isEditing: true })
    const item = wrapper.get('[data-deco-item]')
    expect(item.attributes('tabindex')).toBe('0')
    expect(item.attributes('role')).toBe('button')

    await item.trigger('keydown', { key: 'ArrowRight' })
    await item.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('nudge')).toEqual([[{ left: BOX.left + 4 }], [{ top: BOX.top + 4 }]])
  })

  it('Shift = langkah cepat; +/- ukuran; [ ] putar', async () => {
    const wrapper = await mountItem({ isEditing: true })
    const item = wrapper.get('[data-deco-item]')

    await item.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    await item.trigger('keydown', { key: '+' })
    await item.trigger('keydown', { key: '-' })
    await item.trigger('keydown', { key: '[' })
    await item.trigger('keydown', { key: ']' })

    const emitted = wrapper.emitted('nudge') ?? []
    expect(emitted[0]).toEqual([{ left: BOX.left - 16 }])
    expect(emitted[1]).toEqual([{ size: BOX.size + 8, left: BOX.left - 4, top: BOX.top - 4 }])
    expect(emitted[2]).toEqual([{ size: BOX.size - 8, left: BOX.left + 4, top: BOX.top + 4 }])
    expect(emitted[3]).toEqual([{ rot: BOX.rot - 15 }])
    expect(emitted[4]).toEqual([{ rot: BOX.rot + 15 }])
  })

  it('Delete/Backspace menghapus sticker', async () => {
    const wrapper = await mountItem({ isEditing: true })
    await wrapper.get('[data-deco-item]').trigger('keydown', { key: 'Delete' })
    expect(wrapper.emitted('remove')).toHaveLength(1)

    await wrapper.get('[data-deco-item]').trigger('keydown', { key: 'Backspace' })
    expect(wrapper.emitted('remove')).toHaveLength(2)
  })

  it('drag dimulai dari badan sticker (mode move)', async () => {
    const wrapper = await mountItem({ isEditing: true })
    await wrapper.get('[data-deco-item]').trigger('pointerdown')
    const [event, mode] = wrapper.emitted('drag')?.[0] ?? []
    expect(event).toBeInstanceOf(Event)
    expect(mode).toBe('move')
  })

  it('sticker terpilih menampilkan tombol putar/ukuran/hapus/ganti/ke depan', async () => {
    const wrapper = await mountItem({ isEditing: true, isSelected: true })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(5)

    const byLabel = (label: string) =>
      buttons.find(
        (button) =>
          button.attributes('title') === label || button.attributes('aria-label') === label,
      )

    await byLabel('Hapus')?.trigger('click')
    await byLabel('Ganti sticker')?.trigger('click')
    await byLabel('Taruh paling depan')?.trigger('click')

    expect(wrapper.emitted('remove')).toHaveLength(1)
    expect(wrapper.emitted('swap')).toHaveLength(1)
    expect(wrapper.emitted('front')).toHaveLength(1)
  })

  it('gaya: posisi & ukuran dibulatkan, rotasi dipakai, terpilih selalu di atas', async () => {
    const wrapper = await mountItem({ box: { left: 10.6, top: 20.2, size: 95.7, rot: 12.4 } })
    const style = wrapper.get('[data-deco-item]').attributes('style') ?? ''
    expect(style).toContain('left: 11px')
    expect(style).toContain('top: 20px')
    expect(style).toContain('width: 96px')
    expect(style).toContain('rotate(12deg)')
    expect(style).toContain('z-index: 4')

    await wrapper.setProps({ isEditing: true, isSelected: true })
    expect(wrapper.get('[data-deco-item]').attributes('style')).toContain('z-index: 1004')
  })
})
