import { Stack } from 'expo-router'

// Tempat gate lisensi + kunci app nanti (code-quality.md: Navigasi), bukan di tiap screen.
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="habit" />
      <Stack.Screen
        name="quick-add"
        options={{ presentation: 'transparentModal', animation: 'fade' }}
      />
    </Stack>
  )
}
