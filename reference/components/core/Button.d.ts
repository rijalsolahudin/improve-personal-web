/**
 * @startingPoint section="Core" subtitle="Pill buttons — primary, outline, dashed, ghost" viewport="700x300"
 */
export interface ButtonProps {
  /** primary = filled accent pill; outline = ink-bordered paper; dashed = "+ add" affordance; ghost = accent text link */
  variant?: 'primary' | 'outline' | 'dashed' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  /** 3px ink border + hard drop shadow — hero CTAs only (e.g. Pomodoro start) */
  chunky?: boolean;
  block?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
