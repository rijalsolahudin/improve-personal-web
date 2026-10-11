export interface HabitTileProps { name: string; /** habit's own color, shown only when done */ color?: string; streak?: number; done?: boolean; onToggle?: () => void }
