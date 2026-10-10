export interface SegmentedOption { value: string; label: string; /** optional color dot (theme picker) */ swatch?: string }
export interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange?: (value: string) => void;
  /** paper bg + line border instead of chip track */
  framed?: boolean;
  style?: React.CSSProperties;
}
