import * as LocalAuthentication from 'expo-local-authentication'

import { getBiometricStatus } from './biometric'

const { SecurityLevel } = LocalAuthentication

describe('getBiometricStatus', () => {
  it.each([
    [SecurityLevel.BIOMETRIC_STRONG, 'available'],
    [SecurityLevel.BIOMETRIC_WEAK, 'weak-only'],
    [SecurityLevel.SECRET, 'not-enrolled'],
    [SecurityLevel.NONE, 'not-enrolled'],
  ])('level %s -> %s', async (level, expected) => {
    jest.mocked(LocalAuthentication.getEnrolledLevelAsync).mockResolvedValueOnce(level)

    expect(await getBiometricStatus()).toBe(expected)
  })

  it('tanpa sensor: unsupported tanpa menanyakan level', async () => {
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValueOnce(false)

    expect(await getBiometricStatus()).toBe('unsupported')
  })
})
