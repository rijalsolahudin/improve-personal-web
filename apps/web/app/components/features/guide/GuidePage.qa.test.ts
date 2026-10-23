import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PanduanPage from '~/pages/app/panduan.vue'
import { GUIDE_COPY, GUIDE_FAQ, GUIDE_FEATURES, guideAnchor } from '~/utils/guide'

/**
 * QA T15: halaman Panduan sebagai dokumen yang benar-benar bisa dipakai.
 *
 * Tiga hal yang tidak bisa dibuktikan oleh test isi (`guide.qa.test.ts`) dan hanya terlihat setelah
 * halaman dirender:
 * 1. tiap anchor daftar isi punya target di DOM (kalau tidak, link-nya mati),
 * 2. tiap F1–F16 punya section yang benar-benar muncul (bukan hanya ada di array),
 * 3. heading & FAQ memakai elemen semantik (h1/h2/h3, `<details>`/`<summary>`), bukan div yang tidak
 *    bisa dioperasikan keyboard.
 *
 * Halaman ini statis: tidak ada `useFetch`, jadi mount tanpa stub jaringan adalah kondisi produksi.
 */
describe('halaman Panduan', () => {
  it('merender section untuk semua F1–F16 beserta anchor-nya', async () => {
    const wrapper = await mountSuspended(PanduanPage)
    await flushPromises()

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.find('h1').text()).toBe(GUIDE_COPY.title)

    for (const feature of GUIDE_FEATURES) {
      const anchor = guideAnchor(feature.id)
      const card = wrapper.find(`#${anchor}`)
      expect(card.exists(), `section ${feature.code} (${anchor}) tidak dirender`).toBe(true)
      expect(card.text()).toContain(feature.title)
      expect(card.text()).toContain(GUIDE_COPY.status[feature.status])
    }
  })

  it('daftar isi bisa diklik: tiap href menunjuk target yang ada & unik', async () => {
    const wrapper = await mountSuspended(PanduanPage)
    await flushPromises()

    const links = wrapper.findAll('nav.toc a')
    expect(links.length).toBe(GUIDE_FEATURES.length + 4) // + keamanan, backup, FAQ, balik ke atas

    const hrefs = links.map((link) => link.attributes('href') ?? '')
    expect(new Set(hrefs).size).toBe(hrefs.length)

    for (const link of links) {
      const href = link.attributes('href') ?? ''
      expect(href.startsWith('#')).toBe(true)
      const target = href.slice(1)
      expect(target.length).toBeGreaterThan(0)
      expect(wrapper.find(`#${target}`).exists(), `anchor ${href} tidak punya target`).toBe(true)
    }
  })

  it('tidak ada id ganda di halaman (anchor tidak saling menimpa)', async () => {
    const wrapper = await mountSuspended(PanduanPage)
    await flushPromises()

    const ids = wrapper.findAll('[id]').map((element) => element.attributes('id') ?? '')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('tiap link daftar isi punya teks yang bisa dibaca', async () => {
    const wrapper = await mountSuspended(PanduanPage)
    await flushPromises()

    for (const link of wrapper.findAll('nav.toc a')) {
      expect(link.text().trim().length).toBeGreaterThan(2)
    }

    // Link fitur memuat kode PRD + judul, sehingga jelas section mana yang dituju.
    const scheduleLink = wrapper
      .findAll('nav.toc a')
      .find((link) => (link.attributes('href') ?? '') === `#${guideAnchor('schedule')}`)
    expect(scheduleLink?.text()).toContain('F1')
    expect(scheduleLink?.text()).toContain('Jadwal')
  })

  it('heading terstruktur: satu h1, tidak ada lompatan level', async () => {
    const wrapper = await mountSuspended(PanduanPage)
    await flushPromises()

    const headings = wrapper.findAll('h1, h2, h3, h4, h5, h6')
    expect(headings.length).toBeGreaterThan(GUIDE_FEATURES.length)

    const levels = headings.map((heading) => Number(heading.element.tagName.slice(1)))
    expect(levels[0]).toBe(1)
    for (let index = 1; index < levels.length; index += 1) {
      const previous = levels[index - 1] ?? 1
      expect(levels[index] ?? previous).toBeLessThanOrEqual(previous + 1)
    }
  })

  it('FAQ memakai <details>/<summary> bawaan (bisa dioperasikan keyboard)', async () => {
    const wrapper = await mountSuspended(PanduanPage)
    await flushPromises()

    const details = wrapper.findAll('details')
    expect(details).toHaveLength(GUIDE_FAQ.length)

    for (const faq of GUIDE_FAQ) {
      const item = details.find((candidate) => candidate.text().includes(faq.question))
      expect(item, `FAQ "${faq.question}" tidak dirender`).toBeDefined()
      const summary = item?.find('summary')
      expect(summary?.text()).toContain(faq.question)
      // `<summary>` native sudah fokusabel; tabindex negatif akan mematikan operasi keyboard.
      expect(summary?.attributes('tabindex')).toBeUndefined()
      expect(item?.text()).toContain(faq.answer)
    }
  })

  it('tiap kartu fitur diberi nama oleh heading-nya sendiri', async () => {
    const wrapper = await mountSuspended(PanduanPage)
    await flushPromises()

    const cards = wrapper.findAll('article[aria-labelledby]')
    expect(cards).toHaveLength(GUIDE_FEATURES.length)

    for (const card of cards) {
      const labelId = card.attributes('aria-labelledby') ?? ''
      expect(labelId.length).toBeGreaterThan(0)
      const label = wrapper.find(`#${labelId}`)
      expect(label.exists(), `aria-labelledby ${labelId} tidak punya target`).toBe(true)
      expect(label.element.tagName).toBe('H3')
    }
  })

  it('bagian keamanan tampil dengan judul & isi kunci pemulihan', async () => {
    const wrapper = await mountSuspended(PanduanPage)
    await flushPromises()

    const security = wrapper.find(`#${guideAnchor('security')}`)
    expect(security.exists()).toBe(true)
    expect(security.find('h2').text()).toBe('Gimana data lo dijaga')
    expect(security.text()).toContain('24 kata')
    expect(security.text()).toContain('iprk1')
    expect(security.text()).toContain('passkey')

    const backup = wrapper.find(`#${guideAnchor('backup')}`)
    expect(backup.exists()).toBe(true)
    expect(backup.text()).toMatch(/backup/i)

    const faq = wrapper.find(`#${guideAnchor('faq')}`)
    expect(faq.exists()).toBe(true)
    expect(faq.find('h2').text()).toBe(GUIDE_COPY.faqTitle)
  })
})
