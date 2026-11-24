import { renderHook } from '@testing-library/react-native'
import * as ScreenCapture from 'expo-screen-capture'
import { Platform } from 'react-native'

import { useScreenProtection } from './screen-capture'

function setPlatform(os: 'ios' | 'android'): void {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
}

describe('useScreenProtection', () => {
  const originalOs = Platform.OS

  afterEach(() => setPlatform(originalOs === 'ios' ? 'ios' : 'android'))

  it('Android: FLAG_SECURE selama terpasang, dilepas saat unmount; tanpa API khusus iOS', async () => {
    setPlatform('android')
    const { unmount } = await renderHook(() => useScreenProtection())

    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledWith('improve-personal.global')
    expect(ScreenCapture.enableAppSwitcherProtectionAsync).not.toHaveBeenCalled()

    await unmount()
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledWith('improve-personal.global')
  })

  it('iOS: blokir screenshot + blur penuh di app switcher', async () => {
    setPlatform('ios')
    const { unmount } = await renderHook(() => useScreenProtection())

    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalled()
    expect(ScreenCapture.enableAppSwitcherProtectionAsync).toHaveBeenCalledWith(1)

    await unmount()
    expect(ScreenCapture.disableAppSwitcherProtectionAsync).toHaveBeenCalled()
  })

  it('kegagalan native tidak membuat app crash', async () => {
    setPlatform('ios')
    jest
      .mocked(ScreenCapture.preventScreenCaptureAsync)
      .mockRejectedValueOnce(new Error('unavailable'))
    jest
      .mocked(ScreenCapture.enableAppSwitcherProtectionAsync)
      .mockRejectedValueOnce(new Error('unavailable'))

    await expect(renderHook(() => useScreenProtection())).resolves.toBeDefined()
  })
})
