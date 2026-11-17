import type { Ref } from 'vue'

/**
 * Menautkan error form ke kolom penyebabnya: pesan tampil di bawah kolom itu, kolomnya
 * `aria-invalid` dan menunjuk ke pesan lewat `aria-describedby`.
 *
 * Error yang dipetakan ke `null` bukan milik satu kolom (mis. gagal menulis ke penyimpanan),
 * jadi tetap ditampilkan di bawah form lewat `generalError`.
 */
export function useFieldError<E extends string, F extends string>(
  error: Readonly<Ref<E | null>>,
  fieldOf: Readonly<Record<E, F | null>>,
) {
  const errorId = useId()
  const errorField = computed<F | null>(() => (error.value ? fieldOf[error.value] : null))
  const generalError = computed<E | null>(() =>
    error.value !== null && errorField.value === null ? error.value : null,
  )

  const isInvalid = (field: F): boolean => errorField.value === field
  const describedBy = (field: F): string | undefined => (isInvalid(field) ? errorId : undefined)

  return { errorId, errorField, generalError, isInvalid, describedBy }
}
