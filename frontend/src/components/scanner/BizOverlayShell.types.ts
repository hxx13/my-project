import type { ReactNode, ComponentType } from "react";

/** 扫码弹窗当前人员上下文（快捷业务登记信息与 analyze 一致） */
export interface ScanApplicantContext {
  userId: string;
  userName?: string;
  departmentName?: string;
  projectGroupName?: string;
  group?: string;
}

/** 业务项组件与覆盖层容器之间的唯一接口契约 */
export interface BizItemSlotProps {
  userId: string;
  /** 扫码解析到的人员信息（姓名、课题组等） */
  scanUser?: ScanApplicantContext;
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
  scanUser?: ScanApplicantContext;
  title: string;
  onCancel: () => void;
  className?: string;
}
