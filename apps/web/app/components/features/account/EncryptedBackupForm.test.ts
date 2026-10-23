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

  it('batas 12 karakter tertulis dan ditegakkan di UI (bukan cuma lewat konstanta)', async () => {
    // Penurunan batas ke 8 pernah lolos karena test lama memakai konstanta yang sama dengan kode.
    // Di sini angkanya literal: hint harus menyebut 12, dan 11 karakter harus tetap mematikan unduh.
    const wrapper = await mountSuspended(EncryptedBackupForm, { props: { code: 'iprk1.abc' } })
    const [passphrase, confirmation] = wrapper.findAll('input[type="password"]')
    const submit = wrapper.find('button[type="submit"]')
    const eleven = 'Abcdefghi12'
    const twelve = 'Abcdefghij12'

    expect(eleven).toHaveLength(11)
    expect(twelve).toHaveLength(12)
    expect(wrapper.text()).toContain('Minimal 12 karakter')

    await passphrase?.setValue(eleven)
    await confirmation?.setValue(eleven)
    expect(submit.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[role="alert"]').text()).toContain('kurang panjang')

    await passphrase?.setValue(twelve)
    await confirmation?.setValue(twelve)
    expect(submit.attributes('disabled')).toBeUndefined()
  })
})
