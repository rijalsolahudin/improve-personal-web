export interface MemoPaperProps {
  /** notebook stock */
  paper?: 'krem' | 'putih' | 'pink' | 'kuning' | 'hijau' | 'biru' | 'lavender' | 'malam';
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  minHeight?: number;
  readOnly?: boolean;
}
