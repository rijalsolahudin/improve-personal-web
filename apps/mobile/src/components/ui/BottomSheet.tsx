import { useEffect, useState, type ReactNode } from 'react'
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useHardwareBack } from '@/hooks/useHardwareBack'
import { useThemedStyles } from '@/hooks/useThemedStyles'
import { useTheme } from '@/providers/ThemeProvider'
import type { Theme } from '@/theme'

import { AppText } from './AppText'
import { Icon } from './Icon'

const HANDLE_WIDTH = 40
const HANDLE_HEIGHT = 5

export type BottomSheetProps = {
  title: string
  onClose: () => void
  children: ReactNode
  closeLabel?: string
}

/**
 * Lembar bawah dengan scrim. Dirender saat terbuka, ditutup lewat tombol, scrim, atau back Android.
 * Animasi masuk memakai native driver (UI thread).
 */
export function BottomSheet({ title, onClose, children, closeLabel = 'Tutup' }: BottomSheetProps) {
  const styles = useThemedStyles(createStyles)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  // Dibuat sekali; posisi awal di bawah layar lalu digeser ke 0 oleh native driver.
  const [translateY] = useState(() => new Animated.Value(height))

  useHardwareBack(onClose)

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: theme.durationMs,
      useNativeDriver: true,
    }).start()
  }, [translateY, theme.durationMs])

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Scrim disembunyikan dari pembaca layar: tombol tutup eksplisit sudah ada di header. */}
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, styles.scrim]}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
        style={styles.anchor}
      >
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + theme.spacing[16], transform: [{ translateY }] },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <AppText variant="h2">{title}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              hitSlop={theme.spacing[8]}
              onPress={onClose}
              style={styles.close}
            >
              <Icon name="x" color={theme.colors.ink} />
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  )
}

const createStyles = (theme: Theme) => ({
  scrim: { backgroundColor: theme.colors.scrim },
  anchor: { flex: 1, justifyContent: 'flex-end' as const },
  sheet: {
    gap: theme.spacing[16],
    paddingTop: theme.spacing[10],
    paddingHorizontal: theme.layout.gap,
    borderTopLeftRadius: theme.radius.panel,
    borderTopRightRadius: theme.radius.panel,
    backgroundColor: theme.colors.paper,
  },
  handle: {
    alignSelf: 'center' as const,
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.line,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  close: {
    width: theme.layout.tapMin,
    height: theme.layout.tapMin,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
})
