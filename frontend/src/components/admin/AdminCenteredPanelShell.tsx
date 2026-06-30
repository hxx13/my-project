import type { ReactNode } from "react";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  title: string;
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * 管理后台居中弹层：遮罩与面板均相对「当前视口内容区」（top-16 以下）居中，
 * 避免 fixed 被 PageTransition transform 锚到整页或侧栏外。
 */
export function AdminCenteredPanelShell({
  open,
  onClose,
  ariaLabel,
  title,
  headerExtra,
  children,
  className,
}: Props) {
  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[var(--z-modal)]" data-modal-layer="true" role="presentation">
        <button
          type="button"
          className="absolute inset-0 top-16 border-0 bg-black/40"
          aria-label="关闭"
          onClick={onClose}
        />
        <div className="pointer-events-none fixed inset-0 top-16 flex items-center justify-center p-4 sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className={cn(
              "pointer-events-auto flex max-h-[min(85vh,calc(100vh-5rem))] w-full max-w-[min(520px,96vw)] flex-col overflow-hidden rounded-[var(--app-radius-container,16px)] border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-4",
              className
            )}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--twin-hairline)] px-4 py-3">
              <h2 className="text-base font-semibold text-[var(--twin-ink)]">{title}</h2>
              <div className="flex items-center gap-2">
                {headerExtra}
                <button
                  type="button"
                  onClick={onClose}
                  className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
                  aria-label="关闭"
                >
                  ×
                </button>
              </div>
            </div>
            {children}
          </div>
        </div>
      </div>
    </Portal>
  );
}
