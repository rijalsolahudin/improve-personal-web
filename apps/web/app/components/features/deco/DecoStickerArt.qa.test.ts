import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import DecoStickerArt from './DecoStickerArt.vue'

let mounted: VueWrapper | null = null

async function mountArt(sid: string, size = 96): Promise<VueWrapper> {
  mounted = await mountSuspended(DecoStickerArt, { props: { sid, size } })
  await flushPromises()
  return mounted
}

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('QA T24 · ID tak dikenal → placeholder tanpa error', () => {
  it('sticker dari pack yang sudah dihapus: render tanda "?" dan label jelas', async () => {
    const wrapper = await mountArt('pack-dihapus/stiker-lama')
    expect(wrapper.text()).toContain('?')
    expect(wrapper.find('.unknown').exists()).toBe(true)
    expect(wrapper.attributes('title')).toBe('Sticker tidak dikenal')
  })

  it('id rusak / kosong juga tidak melempar error', async () => {
    for (const sid of ['', 'bukan-id', 'javascript:alert(1)', 'mood/']) {
      const wrapper = await mountArt(sid)
      expect(wrapper.find('.unknown').exists(), sid).toBe(true)
      wrapper.unmount()
    }
    mounted = null
  })

  it('id sah yang ada di katalog dirender sebagai emoji (bukan placeholder)', async () => {
    const wrapper = await mountArt('mood/bahagia')
    expect(wrapper.text()).toContain('😄')
    expect(wrapper.find('.unknown').exists()).toBe(false)
    expect(wrapper.attributes('title')).toBe('Bahagia')
  })

  it('varian ikon: tile berlatar warna pack, tanpa placeholder', async () => {
    const wrapper = await mountArt('icon:mood/bahagia', 60)
    const style = wrapper.attributes('style') ?? ''
    expect(style).toContain('background: #FFE7A8')
    expect(style).toContain('border-radius')
    expect(wrapper.find('.unknown').exists()).toBe(false)
    expect(wrapper.text()).toContain('😄')
  })

  it('ukuran kecil (ikon habit/countdown) tetap dirender tanpa NaN', async () => {
    const wrapper = await mountArt('hewan/kelinci', 32)
    const style = wrapper.attributes('style') ?? ''
    expect(style).toContain('width: 32px')
    expect(style).toContain('height: 32px')
    expect(style).not.toContain('NaN')
  })
})
