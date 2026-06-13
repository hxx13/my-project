import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Z_INDEX } from "@/constants/zIndex";
import { SCAN_NESTED_BACKDROP, SCAN_MODAL_LAYER_PROPS, SCAN_WARNING_PANEL } from "./scanPopupTheme";
import { useTheme } from "@/features/theme/ThemeProvider";

type Props = {
  message: string | null;
  /** 递增以重新触发弹窗（同一条消息再次拦截时） */
  triggerKey: number;
  /** 屏蔽截止时间戳(ms)，用于显示倒计时；0 表示无需倒计时 */
  blockedUntil: number;
};

/**
 * 重复刷卡警告 banner — 弹窗打开后 30s 内本人再次刷卡时触发。
 * 居中警告窗，与违规通告/公告弹窗同级 (z-[100130])，显示倒计时秒数。
 */
export function RepeatedSwipeWarningBanner({ message, triggerKey, blockedUntil }: Props) {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const [panelOpen, setPanelOpen] = useState(false);
  const lastKeyRef = useRef(triggerKey);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (message && triggerKey !== lastKeyRef.current) {
      lastKeyRef.current = triggerKey;
      setPanelOpen(true);
    }
  }, [message, triggerKey]);

  useEffect(() => {
    if (!panelOpen || !blockedUntil) return;
    const tick = () => {
      const r = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
      setRemaining(r);
      if (r <= 0) setPanelOpen(false);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [panelOpen, blockedUntil]);

  const dismiss = useCallback(() => setPanelOpen(false), []);

  if (!message) return null;

  return createPortal(
    <div className={`${theme.className} ${isDark ? 'dark' : ''}`}>
    <AnimatePresence>
      {panelOpen ? (
        <motion.div
          key={`repeated-swipe-${triggerKey}`}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          {...SCAN_MODAL_LAYER_PROPS}
          className={`fixed inset-0 flex items-center justify-center p-4 ${SCAN_NESTED_BACKDROP}`}
          style={{ zIndex: Z_INDEX.popupModal }}
          onClick={dismiss}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="repeated-swipe-warning-title"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className={SCAN_WARNING_PANEL}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scan-warning-panel__icon">
              <AlertTriangle className="h-7 w-7" aria-hidden />
            </div>
            <p id="repeated-swipe-warning-title" className="scan-warning-panel__title">
              {message}
            </p>
            {blockedUntil > 0 && remaining > 0 ? (
              <p className="scan-warning-panel__countdown">
                {remaining} 秒后可再次刷卡
              </p>
            ) : null}
            <button type="button" onClick={dismiss} className="scan-warning-panel__btn">
              我知道了
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
    </div>,
    document.body,
  );
}
