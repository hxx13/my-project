import { createContext, useContext } from 'react';
import type { CellFormat } from '@/features/smartsheet/types';

export interface FormatContextValue {
  format: CellFormat;
  setFormat: (f: Partial<CellFormat>) => void;
  clearFormat: () => void;
}

export const FormatContext = createContext<FormatContextValue>({
  format: {},
  setFormat: () => {},
  clearFormat: () => {},
});

export function useCellFormat() {
  return useContext(FormatContext);
}