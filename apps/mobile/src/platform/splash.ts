import * as SplashScreen from 'expo-splash-screen'

/** Tahan splash sampai data kritis (font) siap - dipanggil sekali di level modul root. */
export function holdSplash(): void {
  void SplashScreen.preventAutoHideAsync()
}

export function releaseSplash(): void {
  SplashScreen.hide()
}
