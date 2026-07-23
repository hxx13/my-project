import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Z_INDEX } from "@/constants/zIndex";
import { useTheme } from "@/features/theme/ThemeProvider";

type Props = {
  message: string | null;
  /** 递增以重置 15s 自动关闭计时（不重播动画） */
  triggerKey: number;
};

const AUTO_CLOSE_MS = 15_000;

/**
 * 重复刷卡全屏红色脉冲警告 — 弹窗打开后同一人再次刷卡时触发。
 * 全屏高浓度红色脉冲光晕遮罩，居中警告卡片。
 * 首次刷卡弹出带入场动画，后续重复刷卡静默重置 15s 计时不重播动画。
 * 15 秒自动关闭或点击"我知道了"关闭。
 * 通过 createPortal 挂载到 document.body，z-index=820 覆盖所有扫描子窗。
 */
export function RepeatedSwipeWarningBanner({ message, triggerKey }: Props) {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const [panelOpen, setPanelOpen] = useState(false);
  const lastKeyRef = useRef(triggerKey);
  const panelOpenRef = useRef(false);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 稳定 key：避免 AnimatePresence 因 triggerKey 变化而重播入场动画
  const stableKeyRef = useRef(0);
  const [stableKey] = useState(() => {
    stableKeyRef.current = Date.now();
    return stableKeyRef.current;
  });

  // 同步 panelOpen → ref
  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);

  // 启动 / 重置自动关闭定时器
  const resetAutoClose = useCallback(() => {
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    autoCloseRef.current = setTimeout(() => {
      setPanelOpen(false);
    }, AUTO_CLOSE_MS);
  }, []);

  // 清理定时器
  const clearAutoClose = useCallback(() => {
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  }, []);

  // 监听 triggerKey 变化
  useEffect(() => {
    if (!message) return;
    if (triggerKey !== lastKeyRef.current) {
      lastKeyRef.current = triggerKey;
      if (panelOpenRef.current) {
        // 已显示：静默重置计时，不重播动画
        resetAutoClose();
      } else {
        // 首次触发：播放入场动画
        setPanelOpen(true);
      }
    }
  }, [message, triggerKey, resetAutoClose]);

  // panelOpen 变为 true 时启动定时器
  useEffect(() => {
    if (panelOpen) {
      resetAutoClose();
    } else {
      clearAutoClose();
    }
  }, [panelOpen, resetAutoClose, clearAutoClose]);

  const dismiss = useCallback(() => {
    clearAutoClose();
    setPanelOpen(false);
  }, [clearAutoClose]);

  // 组件卸载时清理
  useEffect(() => {
    return () => clearAutoClose();
  }, [clearAutoClose]);

  if (!message) return null;

  return createPortal(
    <div className={`${theme.className} ${isDark ? 'dark' : ''}`}>
    <style>{`
      @keyframes redPulseGlow {
        0%, 100% {
          box-shadow: inset 0 0 80px rgba(239,68,68,0.45), 0 0 60px rgba(239,68,68,0.3);
          background: rgba(239,68,68,0.45);
        }
        50% {
          box-shadow: inset 0 0 160px rgba(239,68,68,0.7), 0 0 120px rgba(239,68,68,0.55);
          background: rgba(239,68,68,0.6);
        }
      }
    `}</style>
    <AnimatePresence>
      {panelOpen ? (
        <motion.div
          key={`repeated-swipe-${stableKey}`}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: Z_INDEX.repeatedSwipeWarning }}
          onClick={dismiss}
        >
          {/* 红色脉冲光晕全屏遮罩 — 高浓度不透明 */}
          <div
            className="absolute inset-0"
            style={{ animation: 'redPulseGlow 1.2s ease-in-out infinite' }}
          />

          {/* 居中警告卡片 */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="repeated-swipe-warning-title"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="relative z-10 flex flex-col items-center gap-5 px-8 py-7 rounded-[var(--app-radius-container)]
              bg-[var(--app-color-surface-page)] border-2 border-red-500/60
              shadow-[0_0_80px_rgba(239,68,68,0.5),0_8px_32px_rgba(0,0,0,0.35)]
              max-w-[380px] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 红色告警图标 */}
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/20">
              <AlertTriangle className="h-7 w-7 text-red-500" aria-hidden strokeWidth={2} />
            </div>

            {/* 文案 */}
            <div className="flex flex-col items-center gap-1.5 text-center">
              <p id="repeated-swipe-warning-title" className="text-[18px] font-extrabold text-[var(--app-color-text-primary)]">
                {message}
              </p>
              <p className="text-[13px] text-[var(--app-color-text-tertiary)]">
                防止多次刷卡误操作
              </p>
            </div>

            {/* 我知道了 */}
            <button
              type="button"
              onClick={dismiss}
              className="px-6 py-2.5 rounded-[var(--app-radius-element)] text-sm font-semibold
                bg-red-500 text-white hover:bg-red-600 active:scale-[0.97]
                transition-all duration-150"
            >
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
