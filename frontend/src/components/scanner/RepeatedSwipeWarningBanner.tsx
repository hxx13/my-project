import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

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
  const [panelOpen, setPanelOpen] = useState(false);
  const lastKeyRef = useRef(triggerKey);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (message && triggerKey !== lastKeyRef.current) {
      lastKeyRef.current = triggerKey;
      setPanelOpen(true);
    }
  }, [message, triggerKey]);

  // 倒计时
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
    <AnimatePresence>
      {panelOpen ? (
        <motion.div
          key={`repeated-swipe-${triggerKey}`}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100130] flex items-center justify-center bg-black/65 p-4 backdrop-blur-md"
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
            className="relative flex w-full max-w-[min(96vw,420px)] flex-col items-center gap-4 overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-b from-[#1a1005]/98 to-black/95 px-6 py-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-400/40">
              <AlertTriangle className="h-7 w-7 text-amber-400" />
            </div>
            <p
              id="repeated-swipe-warning-title"
              className="text-center text-base font-bold leading-relaxed text-amber-100"
            >
              {message}
            </p>
            {blockedUntil > 0 && remaining > 0 ? (
              <p className="text-center text-sm font-bold text-amber-300/80">
                {remaining} 秒后可再次刷卡
              </p>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-6 py-2.5 text-sm font-bold text-amber-100 transition-all hover:bg-amber-500/20 active:scale-[0.97]"
            >
              我知道了
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
