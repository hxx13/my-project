import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Z_INDEX } from "@/constants/zIndex";
import { useBizOverlayShell } from "./useBizOverlayShell";
import { useBizRegistry } from "./useBizRegistry";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import type { BizOverlayShellProps } from "./BizOverlayShell.types";
import { SCAN_NESTED_BACKDROP, SCAN_MODAL_LAYER_PROPS } from "./scanPopupTheme";
import { useTheme } from "@/features/theme/ThemeProvider";

/** Per-item error boundary — one biz item crash doesn't take down the overlay */
class BizItemErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-[var(--app-radius-element)] border border-[var(--app-color-feedback-danger)]/30 bg-[var(--app-color-feedback-danger-soft)] p-3 text-xs text-[var(--app-color-feedback-danger)]">
          ⚠️「{this.props.label}」加载失败
        </div>
      );
    }
    return this.props.children;
  }
}

export function BizOverlayShell({ userId, title, onCancel, className = "" }: BizOverlayShellProps) {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const { showKeypad, close, confirm, handlePinSuccess, setShowKeypad } =
    useBizOverlayShell(userId, onCancel);
  const { getItems } = useBizRegistry();

  const items = getItems();

  return (
    <>
      {showKeypad && (
        <NumericKeypad
          mode="verify"
          userId={userId}
          onSuccess={(result) => handlePinSuccess(result)}
          onCancel={() => setShowKeypad(false)}
        />
      )}

      {createPortal(
        <div className={`${theme.className} ${isDark ? 'dark' : ''}`}>
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            {...SCAN_MODAL_LAYER_PROPS}
            className={`fixed inset-0 flex items-center justify-center p-4 ${SCAN_NESTED_BACKDROP}`}
            style={{ zIndex: Z_INDEX.bizOverlay }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 24, opacity: 0 }}
              className={`flex max-h-[80vh] w-full max-w-lg flex-col rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-[var(--app-elevation-modal)] ${className}`}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--app-color-border-default)] p-4">
                <h2 className="text-lg font-bold text-[var(--app-color-text-primary)]">{title}</h2>
                <button onClick={close} className="text-[var(--app-color-text-tertiary)] transition-colors hover:text-[var(--app-color-text-primary)]">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="app-themed-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
                {items.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[var(--app-color-text-tertiary)]">
                    暂无可用的快捷业务
                  </p>
                ) : (
                  items.map((item) => (
                    <BizItemErrorBoundary key={item.id} label={item.label}>
                      <item.component
                        userId={userId}
                        pin=""
                        onDone={close}
                        onError={(msg) => console.error(`[${item.id}]`, msg)}
                      />
                    </BizItemErrorBoundary>
                  ))
                )}
              </div>

              <div className="shrink-0 border-t border-[var(--app-color-border-default)] p-4">
                <button
                  onClick={confirm}
                  disabled={items.length === 0}
                  className="h-11 w-full rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] font-bold text-[var(--app-color-text-inverse)] transition-colors hover:bg-[var(--app-color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  提交
                </button>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
        </div>,
        document.body
      )}
    </>
  );
}
