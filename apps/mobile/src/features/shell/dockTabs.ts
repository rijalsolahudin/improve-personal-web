import type { palette } from '@improve-personal/tokens'
import type { IconName } from '@improve-personal/tokens/icons'
import type { Href } from 'expo-router'

export type DockTab = Readonly<{
  /** Nama route di `app/(app)/(tabs)/`. */
  name: string
  href: Href
  label: string
  icon: IconName
  color: keyof typeof palette
}>

/** Isi dock (navigasi opsi C). Ikon & warna sama dengan navigasi web (`apps/web/app/utils/features.ts`). */
export const DOCK_TABS = [
  { name: 'index', href: '/', label: 'Hari ini', icon: 'sun', color: 'icon-daily' },
  {
    name: 'kalender',
    href: '/kalender',
    label: 'Kalender',
    icon: 'calendar-days',
    color: 'icon-cal',
  },
  { name: 'to-do', href: '/to-do', label: 'To-do', icon: 'list-checks', color: 'icon-todo' },
  { name: 'journal', href: '/journal', label: 'Jurnal', icon: 'notebook-pen', color: 'icon-more' },
  {
    name: 'lainnya',
    href: '/lainnya',
    label: 'Lainnya',
    icon: 'more-horizontal',
    color: 'icon-home',
  },
] as const satisfies readonly DockTab[]
