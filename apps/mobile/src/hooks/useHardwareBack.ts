import { useEffect } from 'react'
import { BackHandler } from 'react-native'

/**
 * Tombol back Android menjalankan `onBack` alih-alih perilaku bawaan selama komponen terpasang.
 * Listener terakhir dipanggil lebih dulu, jadi overlay di atas navigator menang.
 */
export function useHardwareBack(onBack: () => void): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack()
      return true
    })
    return () => subscription.remove()
  }, [onBack])
}
