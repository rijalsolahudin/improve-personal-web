export const OTP_LENGTH = 6

const digitsOnly = (value: string): string => value.replace(/\D/g, '')

/**
 * State kotak OTP. Tiap aksi mengembalikan indeks kotak yang harus difokuskan berikutnya
 * (`null` = fokus tidak berubah) - komponen yang menangani fokus DOM-nya.
 */
export function useOtpInput(length: number = OTP_LENGTH) {
  const digits = ref<string[]>(Array.from({ length }, () => ''))

  const code = computed(() => digits.value.join(''))
  const isComplete = computed(() => digits.value.every((digit) => digit !== ''))

  function fillFrom(start: number, raw: string): number {
    const chars = digitsOnly(raw)
      .slice(0, length - start)
      .split('')
    chars.forEach((char, offset) => {
      digits.value[start + offset] = char
    })
    return Math.min(length - 1, start + chars.length)
  }

  function input(index: number, raw: string): number | null {
    const value = digitsOnly(raw)
    if (value.length > 1) return fillFrom(index, value)
    digits.value[index] = value
    return value && index < length - 1 ? index + 1 : null
  }

  function paste(raw: string): number | null {
    if (!digitsOnly(raw)) return null
    clear()
    return fillFrom(0, raw)
  }

  /** Backspace di kotak kosong menghapus & pindah ke kotak sebelumnya. */
  function backspace(index: number): number | null {
    if (digits.value[index] || index === 0) return null
    digits.value[index - 1] = ''
    return index - 1
  }

  function clear(): void {
    digits.value = Array.from({ length }, () => '')
  }

  return { digits: readonly(digits), code, isComplete, input, paste, backspace, clear }
}
