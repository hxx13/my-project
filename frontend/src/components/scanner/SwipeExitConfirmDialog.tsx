import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogOut } from "lucide-react";
import { resolveAutoSignoutCountdownCopy } from "@/utils/formatCountdown";
import { SCAN_MODAL_LAYER_PROPS } from "./scanPopupTheme";
import { useTheme } from "@/features/theme/ThemeProvider";
import { MobileQrCard } from "./MobileQrCard";
import "./scannerConfirmDialog.css";

interface SwipeExitConfirmDialogProps {
    open: boolean;
    userName: string;
    /** 被扫人账号标识：展示其个人免登录码 */
    userId?: string;
    roomName: string;
    onConfirm: () => void;
    onCancel: () => void;
    /** 自动签退剩余秒数（来自 analyze）；null/undefined 则无倒计时，按钮直接可点 */
    autoSignoutSeconds?: number | null;
    /** PENDING_ACTIVATION / AUTO_EXIT_SCHEDULED；用于区分激活与签退倒计时文案 */
    autoSignoutState?: string | null;
    /** 倒计时归零回调：关闭弹窗 + 刷新状态 */
    onCountdownEnd?: () => void;
}

export function SwipeExitConfirmDialog({
    open,
    userName,
    userId,
    roomName,
    onConfirm,
    onCancel,
    autoSignoutSeconds,
    autoSignoutState,
    onCountdownEnd,
}: SwipeExitConfirmDialogProps) {
    const { theme } = useTheme();
    const isDark = theme.mode === 'dark';
    const [countdown, setCountdown] = useState<number | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hasEndedRef = useRef(false);
    const onConfirmRef = useRef(onConfirm);
    onConfirmRef.current = onConfirm;
    const onCountdownEndRef = useRef(onCountdownEnd);
    onCountdownEndRef.current = onCountdownEnd;

    // 弹窗打开时初始化倒计时
    useEffect(() => {
        if (open && autoSignoutSeconds != null && autoSignoutSeconds > 0) {
            setCountdown(autoSignoutSeconds);
            hasEndedRef.current = false;
        } else {
            setCountdown(null);
        }
    }, [open, autoSignoutSeconds]);

    // 每秒 tick
    useEffect(() => {
        if (countdown == null || countdown <= 0) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }
        intervalRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev == null || prev <= 1) {
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [countdown]);

    // 归零时：仅 AUTO_EXIT_SCHEDULED 自动触发签退，PENDING_ACTIVATION 不自动触发
    useEffect(() => {
        if (countdown === 0 && !hasEndedRef.current) {
            hasEndedRef.current = true;
            if (autoSignoutState === "AUTO_EXIT_SCHEDULED") {
                const t = setTimeout(() => {
                    onConfirmRef.current();
                    onCountdownEndRef.current?.();
                }, 600);
                return () => clearTimeout(t);
            }
        }
    }, [countdown, autoSignoutState]);

    // 方向化重构后：倒计时结束仍自动签退，但按钮不再锁定，可随时点击确认离开（提前签退）
    const countdownCopy = resolveAutoSignoutCountdownCopy(autoSignoutState);

    return createPortal(
        <div className={`${theme.className} ${isDark ? 'dark' : ''} minimizable-notice scan-confirm-dialog`}>
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    {...SCAN_MODAL_LAYER_PROPS}
                    className="mn-backdrop"
                    onKeyDown={(e) => {
                        if (e.key === "Escape") onCancel();
                    }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: 8 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="mn-modal-card"
                    >
                        <button
                            onClick={onCancel}
                            className="mn-close-btn"
                            title="取消 Esc"
                            aria-label="取消"
                        >
                            <X className="h-4 w-4" strokeWidth={2} />
                        </button>

                        <div className="mn-icon-well mn-icon-well--warning">
                            <LogOut className="h-6 w-6" strokeWidth={2.5} />
                        </div>

                        <h2 className="mn-title">确认离开</h2>

                        <div className="w-full text-center" style={{ margin: "2px 0 6px" }}>
                            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--app-color-text-secondary)", lineHeight: 1.4 }}>
                                {userName || "未知人员"}
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2, color: "var(--app-color-feedback-warning)" }}>
                                {roomName || "当前房间"}
                            </div>
                        </div>

                        {countdown != null && countdown > 0 && (
                            <div className="mn-desc" style={{ fontSize: 15, fontWeight: 700, color: "var(--app-color-feedback-warning)" }}>
                                {countdownCopy.badge}　{Math.floor(countdown / 60)}:
                                {String(countdown % 60).padStart(2, "0")}
                            </div>
                        )}

                        <div className="w-full text-center" style={{ fontSize: 14, fontWeight: 700, color: "var(--app-color-text-primary)", marginTop: 6 }}>
                            离开后需重新扫码进入
                        </div>

                        {userId && (
                            <div className="mn-extra" style={{ justifyContent: "center" }}>
                                <MobileQrCard userId={userId} showRegenerate={false} />
                            </div>
                        )}

                        <div className="mn-actions">
                            <button
                                type="button"
                                onClick={onCancel}
                                className="mn-btn mn-btn--ghost"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={onConfirm}
                                className="mn-btn mn-btn--danger"
                            >
                                确认离开
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
        </div>,
        document.body
    );
}
