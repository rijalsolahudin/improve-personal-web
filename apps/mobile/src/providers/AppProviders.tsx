import { StatusBar } from 'expo-status-bar'
import { useEffect, type ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { useAppFonts } from '@/platform/fonts'
import { holdSplash, releaseSplash } from '@/platform/splash'

import { ThemeProvider } from './ThemeProvider'

holdSplash()

type AppProvidersProps = {
  children: ReactNode
}

/** Provider akar app. Splash ditahan hanya sampai font siap (performance.md: startup). */
export function AppProviders({ children }: AppProvidersProps) {
  const isFontReady = useAppFonts()

  useEffect(() => {
    if (isFontReady) releaseSplash()
  }, [isFontReady])

  if (!isFontReady) return null

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StatusBar style="dark" />
        {children}
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
