export interface TaskRowProps {
  title: string;
  priority?: 'urgent' | 'medium' | 'low';
  /** time-left copy: "Sisa 3 jam", "Terlambat 2 jam" */
  meta?: string;
  done?: boolean;
  overdue?: boolean;
  /** inset = alt-bg row inside a paper card (Home); card = standalone bordered row (To-do page) */
  variant?: 'inset' | 'card';
  onToggle?: () => void;
  onRemove?: () => void;
}
