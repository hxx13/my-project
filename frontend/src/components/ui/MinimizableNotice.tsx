import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
} from "framer-motion";
import { ChevronDown, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCountdown, remainingSecondsFromScheduledAt } from "@/utils/formatCountdown";
import "./MinimizableNotice.css";

/* ═══════════════════════════════════════════════════════════
   MinimizableNotice — 居中弹窗 → 角落胶囊 通用组件

   每个 portal 根节点注入 minizable-notice + className + style，
   确保 --mn-* 组件令牌在 portal DOM 树内生效。
   ═══════════════════════════════════════════════════════════ */

type Phase = "modal" | "minimizing" | "minimized" | "expanding";

export interface MinimizableNoticeProps {
  open: boolean;
  onDismiss: () => void;

  /* ── 内容 ── */
  icon?: ReactNode;
  title: string;
  description?: string;

  /* ── 倒计时 ── */
  countdownSeconds?: number | null;
  /** 计划截止时刻（yyyy-MM-dd HH:mm:ss）；优先于 countdownSeconds，每秒按当前时间推算 */
  countdownDeadlineAt?: string | null;
  countdownLabel?: string;
  onCountdownExpired?: () => void;

  /* ── 操作 ── */
  actionLabel?: string;
  onAction?: () => void;

  /* ── 次要操作（不自动最小化）── */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;

  /* ── 自定义内容插槽（倒计时与按钮之间，仅 modal 视图）── */
  extra?: ReactNode;

  /* ── 最小化 ── */
  minimizable?: boolean;
  autoMinimizeMs?: number;

  /* ── 主题与布局 ── */
  variant?: "success" | "warning";
  cornerOffset?: { x: number; y: number };
  className?: string;
  style?: React.CSSProperties;
  onPhaseChange?: (phase: Phase) => void;
}

/* ── helpers ── */

function cornerTarget(offset: { x: number; y: number }) {
  return {
    x: window.innerWidth - offset.x - 60,
    y: window.innerHeight - offset.y - 20,
  };
}

/* ═══════════════════════════════════════════════════════════ */

export function MinimizableNotice({
  open,
  onDismiss,
  icon,
  title,
  description,
  countdownSeconds,
  countdownDeadlineAt,
  countdownLabel,
  onCountdownExpired,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  extra,
  minimizable = true,
  autoMinimizeMs,
  variant = "success",
  cornerOffset = { x: 24, y: 24 },
  className,
  style,
  onPhaseChange,
}: MinimizableNoticeProps) {
  /* ── phase（初始 'modal'，open=false 时由 guard 直接返回 null） ── */
  const [phase, setPhase] = useState<Phase>("modal");
  const modalCardRef = useRef<HTMLDivElement>(null);

  /* ── countdown ── */
  const [countdown, setCountdown] = useState<number | null>(null);
  const expiredRef = useRef(onCountdownExpired);
  expiredRef.current = onCountdownExpired;
  const prevOpenRef = useRef(false);
  const deadlineRef = useRef(countdownDeadlineAt);
  deadlineRef.current = countdownDeadlineAt;

  const resolveCountdown = useCallback((): number | null => {
    const fromDeadline = remainingSecondsFromScheduledAt(deadlineRef.current);
    if (fromDeadline != null) return fromDeadline > 0 ? fromDeadline : 0;
    if (countdownSeconds != null && countdownSeconds > 0) return countdownSeconds;
    return null;
  }, [countdownSeconds]);

  /* 仅在通知首次打开或倒计时尚未启动时写入初值，展开胶囊不回溯到快照秒数 */
  useEffect(() => {
    if (!open) {
      prevOpenRef.current = false;
      return;
    }
    const justOpened = !prevOpenRef.current;
    prevOpenRef.current = true;

    setCountdown((prev) => {
      if (!justOpened && prev != null) return prev;
      return resolveCountdown();
    });
  }, [open, resolveCountdown]);

  /* 截止时刻晚于弹窗到达：补一次初值 */
  useEffect(() => {
    if (!open || !countdownDeadlineAt) return;
    setCountdown((prev) => {
      if (prev != null && prev > 0) return prev;
      const rem = remainingSecondsFromScheduledAt(countdownDeadlineAt);
      return rem != null && rem > 0 ? rem : prev;
    });
  }, [open, countdownDeadlineAt]);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  useEffect(() => {
    if (!open) return;
    const tick = () => {
      if (deadlineRef.current) {
        const rem = remainingSecondsFromScheduledAt(deadlineRef.current);
        setCountdown(rem != null && rem > 0 ? rem : 0);
        return;
      }
      setCountdown((prev) =>
        prev != null && prev > 1 ? prev - 1 : prev != null && prev === 1 ? 0 : prev
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (countdown === 0) expiredRef.current?.();
  }, [countdown]);

  /* ── auto minimize ── */
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doMinimize = useCallback(() => {
    const card = modalCardRef.current;
    if (!card) {
      setPhase("minimized");
      return;
    }
    const rect = card.getBoundingClientRect();
    const startCX = rect.left + rect.width / 2;
    const startCY = rect.top + rect.height / 2;
    const target = cornerTarget(cornerOffset);
    const deltaX = target.x - startCX;
    const deltaY = target.y - startCY;

    flyRectRef.current = { w: rect.width, h: rect.height };
    flyX.set(0);
    flyY.set(0);
    flyScale.set(1);
    setPhase("minimizing");

    const ctrls = [
      animate(flyX, deltaX, { duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }),
      animate(flyY, deltaY, { duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }),
      animate(flyScale, 0.28, { duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }),
    ];
    flyCtrlsRef.current = ctrls;

    Promise.all(ctrls).then(() => {
      setPhase("minimized");
      flyRectRef.current = null;
    });
  }, [cornerOffset]);

  const handleMinimize = useCallback(() => {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    doMinimize();
  }, [doMinimize]);

  const handleExpand = useCallback(() => {
    setPhase("modal");
  }, []);

  /* ── fly motion values ── */
  const flyX = useMotionValue(0);
  const flyY = useMotionValue(0);
  const flyScale = useMotionValue(1);
  const flyCtrlsRef = useRef<ReturnType<typeof animate>[]>([]);
  const flyRectRef = useRef<{ w: number; h: number } | null>(null);

  useEffect(() => {
    return () => {
      flyCtrlsRef.current.forEach((c) => c.stop());
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, []);

  /* ── auto-minimize timer ── */
  useEffect(() => {
    if (!open || phase !== "modal" || !autoMinimizeMs) return;
    autoTimerRef.current = setTimeout(handleMinimize, autoMinimizeMs);
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [open, phase, autoMinimizeMs, handleMinimize]);

  /* ── handle action ── */
  const handleAction = useCallback(() => {
    onAction?.();
    if (minimizable) doMinimize();
  }, [onAction, minimizable, doMinimize]);

  /* ── visibility ── */
  if (!open) return null;

  const showModal = phase === "modal" || phase === "expanding";
  const showFly = phase === "minimizing" && flyRectRef.current;
  const showPill = phase === "minimized";

  const countdownDisplay =
    countdown != null && countdown > 0 ? formatCountdown(countdown) : null;

  /* token shell: 每个 portal 根节点注入令牌 class + style */
  const shellClass = cn("minimizable-notice", className);

  const defaultIcon =
    variant === "warning" ? (
      <AlertTriangle className="h-7 w-7" strokeWidth={2.5} />
    ) : (
      <CheckCircle2 className="h-7 w-7" strokeWidth={2.5} />
    );
  const pillIcon =
    variant === "warning" ? (
      <AlertTriangle className="h-5 w-5" strokeWidth={2.5} />
    ) : (
      <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
    );

  const iconWellClass = cn(
    "mn-icon-well",
    variant === "warning" && "mn-icon-well--warning",
    variant === "success" && "mn-icon-well--success"
  );

  return (
    <>
      {/* ═══════ 居中弹窗 ═══════ */}
      {showModal &&
        createPortal(
          <div className={shellClass} style={style}>
            <AnimatePresence>
              <motion.div
                key="mn-modal"
                className="mn-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <motion.div
                  ref={modalCardRef}
                  className="mn-modal-card"
                  initial={{ opacity: 0, scale: 0.92, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 8 }}
                  transition={{ type: "spring", stiffness: 420, damping: 26 }}
                >
                  {/* 关闭 → 等同"知道了"，最小化到角落 */}
                  <button
                    className="mn-close-btn"
                    onClick={handleMinimize}
                    aria-label="最小化到角落"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>

                  {/* 最小化 */}
                  {minimizable && (
                    <button
                      className="mn-minimize-btn"
                      onClick={handleMinimize}
                      aria-label="最小化到角落"
                    >
                      <ChevronDown className="h-4 w-4" strokeWidth={2} />
                    </button>
                  )}

                  {/* 图标 */}
                  <div className={iconWellClass}>
                    {icon ?? defaultIcon}
                  </div>

                  {/* 标题 */}
                  <h2 className="mn-title">{title}</h2>

                  {/* 描述 */}
                  {description && <p className="mn-desc">{description}</p>}

                  {/* 倒计时 */}
                  {countdownDisplay && (
                    <div className="mn-countdown-row">
                      {countdownLabel && (
                        <span className="mn-countdown-badge">
                          {countdownLabel}
                        </span>
                      )}
                      <span className="mn-countdown-time">
                        {countdownDisplay}
                      </span>
                    </div>
                  )}

                  {/* 自定义内容插槽（倒计时与按钮之间） */}
                  {extra && <div className="mn-extra">{extra}</div>}

                  {/* 操作按钮 */}
                  {(actionLabel || secondaryActionLabel) && (
                    <div className="mn-actions">
                      {secondaryActionLabel && (
                        <button
                          className="mn-btn mn-btn--secondary"
                          onClick={() => onSecondaryAction?.()}
                        >
                          {secondaryActionLabel}
                        </button>
                      )}
                      {actionLabel && (
                        <button
                          className="mn-btn mn-btn--primary"
                          onClick={handleAction}
                        >
                          {actionLabel}
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>,
          document.body
        )}

      {/* ═══════ 飞行副本 ═══════ */}
      {showFly &&
        createPortal(
          <div className={shellClass} style={style}>
            <motion.div
              className="mn-fly-card"
              style={{
                width: flyRectRef.current!.w,
                height: flyRectRef.current!.h,
                x: flyX,
                y: flyY,
                scale: flyScale,
              }}
            >
              <div
                className="mn-modal-card"
                style={{ width: "100%", height: "100%", pointerEvents: "none" }}
              >
                <div className={iconWellClass}>
                  {icon ?? defaultIcon}
                </div>
              </div>
            </motion.div>
          </div>,
          document.body
        )}

      {/* ═══════ 角落胶囊 ═══════ */}
      {showPill &&
        createPortal(
          <div className={shellClass} style={style}>
            <div
              className="mn-pill-portal"
              style={{ right: cornerOffset.x, bottom: cornerOffset.y }}
            >
              <AnimatePresence>
                <motion.div
                  key="mn-pill"
                  className="mn-pill"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  onClick={handleExpand}
                  role="button"
                  tabIndex={0}
                  aria-label={`展开通知: ${title}`}
                >
                  <span className="mn-pill-icon">{icon ?? pillIcon}</span>
                  {countdownLabel && (
                    <span className="mn-pill-label">{countdownLabel}</span>
                  )}
                  {countdownDisplay && (
                    <span className="mn-pill-time">{countdownDisplay}</span>
                  )}
                  <button
                    className="mn-pill-dismiss"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss();
                    }}
                    aria-label="关闭通知"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
