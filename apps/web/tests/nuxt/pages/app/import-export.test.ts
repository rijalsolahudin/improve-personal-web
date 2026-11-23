import { BACKUP_PLAINTEXT_WARNING } from '@improve-personal/core'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ImportExportPage from '~/pages/app/import-export.vue'

/**
 * Halaman Backup & Pulihkan benar-benar memunculkan ketiga kartunya.
 *
 * Alasannya sama dengan `layouts/dashboard.test.ts`: nama komponen auto-import TIDAK diverifikasi
 * typecheck. Salah nama (`<FeaturesBackupExportCard />`) tidak jadi error - Vue merendernya sebagai
 * elemen tak dikenal, halaman "jalan", dan fitur backup tidak pernah muncul.
 */
describe('halaman Backup & Pulihkan', () => {
  it('menampilkan kartu backup terenkripsi, pulihkan, dan export JSON + peringatan plaintext', async () => {
    const wrapper = await mountSuspended(ImportExportPage)
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Backup & Pulihkan')
    expect(wrapper.text()).toContain('Backup terenkripsi')
    expect(wrapper.text()).toContain('Pulihkan dari berkas')
    expect(wrapper.text()).toContain('Export JSON')
    // Kartu Drive ikut dirender; tanpa client ID ia jujur menyebut fiturnya belum diaktifkan.
    expect(wrapper.text()).toContain('Backup ke Google Drive')
    expect(wrapper.text()).toContain('belum diaktifkan')
    expect(wrapper.text()).toContain(BACKUP_PLAINTEXT_WARNING)
    expect(wrapper.find('input[type="file"]').exists()).toBe(true)
  })
})
