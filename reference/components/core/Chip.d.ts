export interface ChipProps {
  active?: boolean;
  /** filter = bordered list filter (To-do); soft = borderless pick (focus target, ink when active) */
  variant?: 'filter' | 'soft';
  onClick?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
