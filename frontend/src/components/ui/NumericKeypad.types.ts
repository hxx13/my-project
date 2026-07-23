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
  /** 与键盘同层（z-index keypad）的顶部插槽，如紧凑人脸窗 */
  topSlot?: React.ReactNode;
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
