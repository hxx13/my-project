import type { AuthData } from "@/api/domains/auth.api";

export type KeypadMode = "set" | "verify";
export type KeypadStep = "idle" | "input" | "confirming" | "verifying" | "locked";

export interface NumericKeypadProps {
  mode: KeypadMode;
  userId: string;
  userName?: string;
  onSuccess: (result: AuthData) => void;
  onCancel: () => void;
  className?: string;
}

export interface UseNumericKeypadReturn {
  dots: number[];
  mode: KeypadMode;
  step: KeypadStep;
  isLocked: boolean;
  lockSeconds: number;
  errorText: string | null;
  isLoading: boolean;
  handleDigit: (d: number) => void;
  handleDelete: () => void;
  handleSubmit: () => void;
  handleCancel: () => void;
}
