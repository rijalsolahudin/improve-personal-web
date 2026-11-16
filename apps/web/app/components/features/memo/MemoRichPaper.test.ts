import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MemoRichPaper from './MemoRichPaper.vue'

/**
 * Kertas rich text jurnal: markdown jurnal dimuat sebagai format (bukan teks mentah), mention jadi
 * chip berlabel judul, isi dari user tidak pernah jadi elemen HTML, dan perubahan dari luar
 * (mis. mention dipilih dari daftar saran) memuat ulang isi editor.
 */
const label = (kind: 'schedule' | 'goal', id: string): string =>
  kind === 'goal' ? `Goal ${id}` : `Jadwal ${id}`

async function mountPaper(text: string) {
  const wrapper = await mountSuspended(MemoRichPaper, {
    props: { modelValue: text, label: 'Isi', maxlength: 5000, mentionLabel: label },
  })
  await flushPromises()
  return wrapper
}

describe('MemoRichPaper', () => {
  it('merender format markdown jurnal sebagai format, bukan simbol', async () => {
    const wrapper = await mountPaper('**tebal** *miring* ~~coret~~ ==stabilo==\n- satu')

    expect(wrapper.find('.pm strong').text()).toBe('tebal')
    expect(wrapper.find('.pm em').text()).toBe('miring')
    expect(wrapper.find('.pm s').text()).toBe('coret')
    expect(wrapper.find('.pm mark').text()).toBe('stabilo')
    expect(wrapper.find('.pm ul li').text()).toBe('satu')
    expect(wrapper.find('.pm').text()).not.toContain('**')
  })

  it('stabilo berwarna dimuat dengan warnanya; kuning tanpa atribut warna', async () => {
    const wrapper = await mountPaper('==kuning== =={hijau}hijau== =={biru}biru==')
    const marks = wrapper
      .findAll('.pm mark')
      .map((mark) => [mark.text(), mark.attributes('data-color')])
    expect(marks).toEqual([
      ['kuning', undefined],
      ['hijau', 'hijau'],
      ['biru', 'biru'],
    ])
  })

  it('mention tampil sebagai chip berlabel judul', async () => {
    const wrapper = await mountPaper('Ikut @[kelas] demi #[lari]')
    const chips = wrapper.findAll('.pm .mention-chip').map((chip) => chip.text())
    expect(chips).toEqual(['@Jadwal kelas', '#Goal lari'])
  })

  it('HTML di isi jurnal tetap teks, tidak menjadi elemen', async () => {
    const wrapper = await mountPaper('<img src=x onerror="window.__pwned=1"><b>tebal</b>')
    expect(wrapper.find('.pm img').exists()).toBe(false)
    expect(wrapper.find('.pm b').exists()).toBe(false)
    expect(wrapper.find('.pm').text()).toContain('<b>tebal</b>')
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('isi yang diganti dari luar dimuat ulang ke editor', async () => {
    const wrapper = await mountPaper('awal')
    await wrapper.setProps({ modelValue: 'baru ==ditandai==' })
    await flushPromises()
    expect(wrapper.find('.pm mark').text()).toBe('ditandai')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
