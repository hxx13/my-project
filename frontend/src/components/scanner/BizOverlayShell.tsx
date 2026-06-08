import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Z_INDEX } from "@/constants/zIndex";
import { useBizOverlayShell } from "./useBizOverlayShell";
import { useBizRegistry } from "./useBizRegistry";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import type { BizOverlayShellProps } from "./BizOverlayShell.types";

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
        <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-xs">
          ⚠️「{this.props.label}」加载失败
        </div>
      );
    }
    return this.props.children;
  }
}

export function BizOverlayShell({ userId, title, onCancel, className = "" }: BizOverlayShellProps) {
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
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            style={{ zIndex: Z_INDEX.bizOverlay }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 24, opacity: 0 }}
              className={`w-full max-w-lg max-h-[80vh] rounded-2xl bg-[#0f172a] border border-white/10 shadow-2xl flex flex-col ${className}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
                <h2 className="text-white text-lg font-bold">{title}</h2>
                <button onClick={close} className="text-white/60 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {items.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-8">
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

              {/* Footer */}
              <div className="p-4 border-t border-white/5 shrink-0">
                <button
                  onClick={confirm}
                  disabled={items.length === 0}
                  className="w-full h-11 rounded-xl bg-cyan-500 text-white font-bold
                             hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  提交
                </button>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
