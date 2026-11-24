import * as LocalAuthentication from 'expo-local-authentication'

/**
 * Ketersediaan biometrik untuk UI (mis. menjelaskan kenapa kunci app belum bisa diaktifkan).
 *
 * Sengaja TIDAK ada `authenticate()` di sini: gerbang sebenarnya adalah item Keychain/Keystore yang
 * terikat biometrik (`secure-key-store.ts`), bukan `if (success) showData()` (security.md §3). Hasil
 * fungsi ini juga bukan gerbang keamanan - hanya petunjuk UI.
 */

export type BiometricStatus =
  /** Biometrik kelas kuat (Class 3 / Face ID / Touch ID) terdaftar - bisa mengikat kunci. */
  | 'available'
  /** Hanya biometrik lemah (mis. face unlock kamera Android); Keystore tidak menerimanya. */
  | 'weak-only'
  /** Perangkat punya sensor, tapi belum ada biometrik yang didaftarkan. */
  | 'not-enrolled'
  | 'unsupported'

export async function getBiometricStatus(): Promise<BiometricStatus> {
  if (!(await LocalAuthentication.hasHardwareAsync())) return 'unsupported'

  const level = await LocalAuthentication.getEnrolledLevelAsync()
  if (level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG) return 'available'
  if (level === LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK) return 'weak-only'
  return 'not-enrolled'
}
