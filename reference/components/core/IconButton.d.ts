export interface IconButtonProps {
  /** 44 default (mobile header), 52 for timer controls, 56 desktop bell */
  size?: number;
  /** bell = paper-ringed notification button */
  tone?: 'paper' | 'soft' | 'chip' | 'bell';
  title?: string;
  onClick?: () => void;
  /** a unicode glyph (‹ ↺ ⏭) or small CSS-drawn shape */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
