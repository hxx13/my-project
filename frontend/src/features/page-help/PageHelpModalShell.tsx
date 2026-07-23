import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** 无障碍标签（无可见标题时必填） */
  ariaLabel: string;
  showClose?: boolean;
  closeOnBackdropClick?: boolean;
};

/**
 * 页面帮助专用弹层：Portal + 静态遮罩，不依赖 Radix Dialog。
 * 避免与布局内其它 Dialog 叠加时触发 composeRefs 无限更新（React #185）。
 */
export function PageHelpModalShell({
  open,
  onClose,
  children,
  className,
  ariaLabel,
  showClose = false,
  closeOnBackdropClick = false,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[var(--z-modal)]" data-modal-layer="true" role="presentation">
        {closeOnBackdropClick ? (
          <button
            type="button"
            className="absolute inset-0 top-16 border-0 bg-black/50"
            aria-label="关闭"
            onClick={onClose}
          />
        ) : (
          <div className="absolute inset-0 top-16 bg-black/50" aria-hidden />
        )}

        <div className="pointer-events-none fixed inset-0 top-16 flex items-center justify-center p-4 sm:p-6">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            tabIndex={-1}
            className={cn(
              "page-help-dialog pointer-events-auto relative outline-none",
              "focus-visible:ring-2 focus-visible:ring-[var(--app-color-accent-secondary)]",
              className,
            )}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {showClose ? (
              <button
                type="button"
                className="absolute right-4 top-4 z-[1] inline-flex rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent-secondary)]"
                onClick={onClose}
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            {children}
          </div>
        </div>
      </div>
    </Portal>
  );
}
