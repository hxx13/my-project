import { createContext, useContext } from "react";
import type { CasBindingStatus } from "@/api/domains/admin.api";

export interface CasBindingContextValue {
  /** Current CAS token binding status (null = not yet loaded) */
  casStatus: CasBindingStatus | null;
  /** Programmatically open the CAS token binding dialog in AdminLayout */
  openCasDialog: () => void;
}

export const CasBindingContext = createContext<CasBindingContextValue>({
  casStatus: null,
  openCasDialog: () => {},
});

export function useCasBinding(): CasBindingContextValue {
  return useContext(CasBindingContext);
}
