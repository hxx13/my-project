import { useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft } from "lucide-react";
import { Z_INDEX } from "@/constants/zIndex";
import { getBizItems } from "./useBizRegistry";
import type { BizOverlayShellProps, BizItem } from "./BizOverlayShell.types";

/** 菜单宽度 — 收起时 300px，展开右侧后缩小为 154px */
const MENU_FULL = 300;
const MENU_COMPACT = 154;
/** 总宽度占视口比例 */
const TOTAL_VW = 30;
/** 高度占视口比例 */
const TOTAL_VH = 40;

// 明暗主题适配令牌
const SHELL_BG = "bg-[var(--app-color-surface-container)]";
const SHELL_BORDER = "border-[var(--app-color-border-default)]";
const SHELL_TEXT = "text-[var(--app-color-text-primary)]";
const SHELL_TEXT_MUTED = "text-[var(--app-color-text-tertiary)]";
const SHELL_HOVER = "hover:bg-[var(--app-color-surface-hover)]";
const SHELL_BACKDROP = "bg-black/50 backdrop-blur-sm";

export function BizOverlayShell({ userId, scanUser, title, onCancel }: BizOverlayShellProps) {
  const [selected, setSelected] = useState<BizItem | null>(null);

  const items = useMemo(() => getBizItems(), []);

  const close = useCallback(() => {
    setSelected(null);
    onCancel();
  }, [onCancel]);

  const handleSelect = useCallback((item: BizItem) => {
    setSelected(item);
  }, []);

  const handleBack = useCallback(() => {
    setSelected(null);
  }, []);

  const SelectedComponent = selected?.component ?? null;

  return (
    <>
      {createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 flex items-center justify-center p-4 ${SHELL_BACKDROP}`}
            style={{ zIndex: Z_INDEX.bizOverlay }}
            onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          >
            <motion.div
              layout
              className={`flex rounded-2xl border ${SHELL_BORDER} ${SHELL_BG} shadow-2xl overflow-hidden`}
              style={{
                width: selected
                  ? `calc(${MENU_COMPACT}px + (${TOTAL_VW}vw - ${MENU_COMPACT}px) * 1.4)`
                  : `${MENU_FULL}px`,
                height: `${TOTAL_VH}vh`,
              }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {/* ── 左侧菜单面板（展开右侧时缩小）── */}
              <motion.div
                layout
                className="flex shrink-0 flex-col"
                style={{
                  width: selected ? `${MENU_COMPACT}px` : `${MENU_FULL}px`,
                  minWidth: selected ? `${MENU_COMPACT}px` : `${MENU_FULL}px`,
                }}
              >
                <div className={`flex shrink-0 items-center justify-between border-b ${SHELL_BORDER} px-4 py-3`}>
                  <h2 className={`text-base font-bold ${SHELL_TEXT}`}>
                    {selected ? selected.label : title}
                  </h2>
                  <button onClick={close}
                    className={`${SHELL_TEXT_MUTED} hover:${SHELL_TEXT} transition-colors`}>
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto py-2">
                  {items.length === 0 ? (
                    <p className={`px-4 py-8 text-center text-xs ${SHELL_TEXT_MUTED}`}>
                      暂无可用的快捷业务
                    </p>
                  ) : (
                    items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        className={`w-full flex items-center justify-center gap-3 px-4 py-3 transition-colors ${
                          selected?.id === item.id
                            ? "bg-cyan-500/15 text-cyan-400 border-l-2 border-cyan-400"
                            : `${SHELL_TEXT_MUTED} ${SHELL_HOVER} border-l-2 border-transparent`
                        }`}
                      >
                        {item.icon && (
                          <span className="shrink-0 text-lg">{item.icon}</span>
                        )}
                        <span className="text-sm font-medium">{item.label}</span>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>

              {/* ── 右侧内容面板 ── */}
              {selected && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: `calc((${TOTAL_VW}vw - ${MENU_COMPACT}px) * 1.4)`, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  className={`flex shrink-0 flex-col border-l ${SHELL_BORDER}`}
                  style={{ width: `calc((${TOTAL_VW}vw - ${MENU_COMPACT}px) * 1.4)` }}
                >
                  <div className={`flex shrink-0 items-center gap-2 border-b ${SHELL_BORDER} px-3 py-3`}>
                    <button onClick={handleBack}
                      className={`${SHELL_TEXT_MUTED} hover:${SHELL_TEXT} transition-colors`}>
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className={`text-xs ${SHELL_TEXT_MUTED}`}>{selected.label}</span>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {SelectedComponent && (
                      <selected.component
                        userId={userId}
                        scanUser={scanUser}
                        pin=""
                        onDone={handleBack}
                        onError={(msg) => console.error(`[${selected.id}]`, msg)}
                      />
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
