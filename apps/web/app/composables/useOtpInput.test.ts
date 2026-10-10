import { describe, expect, it } from 'vitest'

import { useOtpInput } from './useOtpInput'

describe('useOtpInput', () => {
  it('mengisi satu digit dan memindah fokus ke kotak berikutnya', () => {
    const otp = useOtpInput()
    expect(otp.input(0, '7')).toBe(1)
    expect(otp.digits.value[0]).toBe('7')
    expect(otp.input(5, '1')).toBeNull()
  })

  it('menolak karakter non-digit', () => {
    const otp = useOtpInput()
    expect(otp.input(0, 'a')).toBeNull()
    expect(otp.digits.value[0]).toBe('')
  })

  it('input banyak digit (autofill) mengisi dari kotak itu ke kanan', () => {
    const otp = useOtpInput()
    expect(otp.input(2, '9876')).toBe(5)
    expect(otp.code.value).toBe('9876')
    expect(otp.digits.value).toEqual(['', '', '9', '8', '7', '6'])
  })

  it('paste menimpa semua kotak dan memotong ke 6 digit', () => {
    const otp = useOtpInput()
    otp.input(0, '1')
    expect(otp.paste('kode: 123-456-789')).toBe(5)
    expect(otp.code.value).toBe('123456')
    expect(otp.isComplete.value).toBe(true)
    expect(otp.paste('tanpa angka')).toBeNull()
  })

  it('backspace di kotak kosong menghapus kotak sebelumnya', () => {
    const otp = useOtpInput()
    otp.paste('12')
    expect(otp.backspace(2)).toBe(1)
    expect(otp.code.value).toBe('1')
    expect(otp.backspace(0)).toBeNull()
  })

  it('clear mengosongkan semua kotak', () => {
    const otp = useOtpInput()
    otp.paste('123456')
    otp.clear()
    expect(otp.isComplete.value).toBe(false)
    expect(otp.code.value).toBe('')
  })
})
