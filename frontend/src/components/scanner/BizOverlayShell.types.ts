import type { ReactNode, ComponentType } from "react";

/** 业务项组件与覆盖层容器之间的唯一接口契约 */
export interface BizItemSlotProps {
  userId: string;
  pin: string;
  onDone: () => void;
  onError: (msg: string) => void;
}

/** 注册表中的业务项定义 */
export interface BizItem {
  id: string;
  label: string;
  icon?: ReactNode;
  order: number;
  component: ComponentType<BizItemSlotProps>;
  enabled?: boolean;
  onBeforeConfirm?: (pin: string) => boolean | Promise<boolean>;
  onAfterConfirm?: (pin: string) => void | Promise<void>;
  validate?: () => string | null;
}

export interface BizOverlayShellProps {
  userId: string;
  title: string;
  onCancel: () => void;
  className?: string;
}
