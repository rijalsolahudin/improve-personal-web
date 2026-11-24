import { createContext, use, useMemo, type ReactNode } from 'react'

import { DEFAULT_MOBILE_THEME, createTheme, type MobileThemeName, type Theme } from '@/theme'

const ThemeContext = createContext<Theme>(createTheme(DEFAULT_MOBILE_THEME))

type ThemeProviderProps = {
  name?: MobileThemeName
  children: ReactNode
}

export function ThemeProvider({ name = DEFAULT_MOBILE_THEME, children }: ThemeProviderProps) {
  const theme = useMemo(() => createTheme(name), [name])
  return <ThemeContext value={theme}>{children}</ThemeContext>
}

export function useTheme(): Theme {
  return use(ThemeContext)
}
