export interface CardProps {
  /** paper = default list container; soft/primary = theme-tinted feature blocks (no border); tinted = category color; sticker = ink-outlined journal card */
  variant?: 'paper' | 'soft' | 'primary' | 'tinted' | 'sticker';
  /** background for variant="tinted", e.g. var(--cat-karier-tint) */
  tint?: string;
  padding?: number | string;
  radius?: number | string;
  /** white dot-grid texture (hero "Berikutnya" card) */
  dotted?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
