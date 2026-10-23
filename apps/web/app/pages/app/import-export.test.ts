import { BACKUP_PLAINTEXT_WARNING } from '@improve-personal/core'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ImportExportPage from './import-export.vue'

/**
 * Halaman Import & Export benar-benar memunculkan kedua kartunya.
 *
 * Alasannya sama dengan `layouts/dashboard.test.ts`: nama komponen auto-import TIDAK diverifikasi
 * typecheck. Salah nama (`<FeaturesBackupExportCard />`) tidak jadi error - Vue merendernya sebagai
 * elemen tak dikenal, halaman "jalan", dan fitur backup tidak pernah muncul.
 */
describe('halaman Import & Export', () => {
  it('menampilkan kartu export + peringatan plaintext dan kartu import', async () => {
    const wrapper = await mountSuspended(ImportExportPage)
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Import / Export')
    expect(wrapper.text()).toContain('Export data')
    expect(wrapper.text()).toContain('Import data')
    expect(wrapper.text()).toContain(BACKUP_PLAINTEXT_WARNING)
    expect(wrapper.find('input[type="file"]').exists()).toBe(true)
  })
})
