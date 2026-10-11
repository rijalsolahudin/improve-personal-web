export interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  /** 26 list rows, 28 full to-do, 22 goal steps */
  size?: number;
  /** fill when checked — success green, or a category color for goal steps */
  color?: string;
}
