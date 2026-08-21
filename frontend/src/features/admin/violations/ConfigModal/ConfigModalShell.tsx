import type { JSX, ReactNode } from "react";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";

type ConfigModalShellProps = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  /** 头部左区：菜单页传标题，子页传面包屑。 */
  header: ReactNode;
  /** 头部右区（✕ 之前）：如 [返回] 按钮。 */
  actions?: ReactNode;
  children: ReactNode;
  /** 加宽弹窗（~1000px），用于重编辑器/列表页。 */
  wide?: boolean;
  /** 主体交由子组件自滚（fill 模式，供 ListPageLayout / EditorInspectorLayout）。默认弹窗体滚动。 */
  fill?: boolean;
  /** 额外覆盖 dialog 样式（如自定义 max-width）。 */
  dialogClassName?: string;
};

/**
 * 配置弹窗通用壳：居中 dialog（默认 520px，wide → 1000px，dialogClassName 可覆盖）。
 * 高度：fill 页给定高 h-[min(85vh,calc(100vh-5rem))]（calc 运算符必须带空格），
 * 使子组件 flex-1 min-h-0 有确定高度、在弹窗内部自滚不溢出；否则 max-h 内容自适应、弹窗体滚动。
 */
export function ConfigModalShell({
  open,
  onClose,
  ariaLabel,
  header,
  actions,
  children,
  wide,
  fill,
  dialogClassName,
}: ConfigModalShellProps): JSX.Element | null {
  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[var(--z-modal)]" role="presentation">
        <button type="button" aria-label="关闭" onClick={onClose} className="absolute inset-0 border-0 bg-black/40" />
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center p-4 sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              "pointer-events-auto flex w-full flex-col overflow-hidden rounded-[var(--app-radius-container,16px)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] [box-shadow:var(--app-elevation-modal)]",
              fill
                ? "h-[min(85vh,calc(100vh-5rem))]"
                : "max-h-[min(85vh,calc(100vh-5rem))]",
              wide ? "max-w-[min(1000px,94vw)]" : "max-w-[min(520px,96vw)]",
              dialogClassName
            )}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--app-color-border-default)] px-4 py-2.5">
              <div className="min-w-0 flex-1">{header}</div>
              <div className="flex shrink-0 items-center gap-2">
                {actions}
                <button
                  type="button"
                  aria-label="关闭"
                  onClick={onClose}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-sm text-[var(--app-color-text-tertiary)] transition-colors hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className={cn("min-h-0 flex-1", fill ? "flex flex-col p-4" : "overflow-y-auto overscroll-y-contain p-4")}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
