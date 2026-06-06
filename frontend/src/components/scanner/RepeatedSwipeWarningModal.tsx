import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

type Props = {
  message: string | undefined;
};

/**
 * 重复刷卡警告弹窗 — 弹窗会话活跃期间本人再次刷卡时触发。
 * 居中显示在公告弹窗上方 (z-[100140])，复用公告弹窗的视觉风格。
 * 人员点击确认按钮后关闭，前端本地管理状态。
 */
export function RepeatedSwipeWarningModal({ message }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (message) setOpen(true);
    else setOpen(false);
  }, [message]);

  const dismiss = useCallback(() => setOpen(false), []);

  if (!message) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="repeated-swipe-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100140] flex items-center justify-center bg-black/65 p-4 backdrop-blur-md"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="repeated-swipe-title"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="relative flex w-full max-w-[min(96vw,420px)] flex-col items-center gap-4 overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-b from-[#1a1005]/98 to-black/95 px-6 py-8 shadow-2xl"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-400/40">
              <AlertTriangle className="h-7 w-7 text-amber-400" />
            </div>
            <p
              id="repeated-swipe-title"
              className="text-center text-base font-bold leading-relaxed text-amber-100"
            >
              {message}
            </p>
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
