import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import { MIN_PASSPHRASE_LENGTH } from '~/utils/account/encrypted-backup'

import EncryptedBackupForm from './EncryptedBackupForm.vue'

/**
 * Form unduh berkas terenkripsi: tombol unduh baru hidup kalau kata sandinya cukup panjang DAN sudah
 * diketik ulang sama persis. Enkripsinya sendiri diuji di `utils/account/backup-code.test.ts`.
 */
describe('form berkas terenkripsi', () => {
  it('unduh mati sampai kata sandi cukup panjang dan diulang sama persis', async () => {
    const wrapper = await mountSuspended(EncryptedBackupForm, { props: { code: 'iprk1.abc' } })
    const [passphrase, confirmation] = wrapper.findAll('input[type="password"]')
    const submit = wrapper.find('button[type="submit"]')
    const valid = 'a'.repeat(MIN_PASSPHRASE_LENGTH)

    await passphrase?.setValue('pendek')
    await confirmation?.setValue('pendek')
    expect(submit.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[role="alert"]').text()).toContain('kurang panjang')

    await passphrase?.setValue(valid)
    await confirmation?.setValue(`${valid}x`)
    expect(submit.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[role="alert"]').text()).toContain('belum sama')

    await confirmation?.setValue(valid)
    expect(submit.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
