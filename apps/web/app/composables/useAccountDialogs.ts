export type AccountDialog = 'profile' | 'security'

/**
 * Modal akun yang sedang terbuka. Dialognya dipasang sekali di layout dashboard; menu sidebar, menu
 * HP, dan tombol lain cukup memanggil `open()`.
 */
export function useAccountDialogs() {
  const current = useState<AccountDialog | null>('accountDialog', () => null)

  return {
    current: computed(() => current.value),
    open: (dialog: AccountDialog) => {
      current.value = dialog
    },
    close: () => {
      current.value = null
    },
  }
}
