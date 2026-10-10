export interface TabBarItem { key: string; label: string; glyph: React.ReactNode; color: string }
export interface TabBarProps { items: TabBarItem[]; active: string; onChange?: (key: string) => void; /** center leaf-cornered FAB */ onAdd?: () => void }
