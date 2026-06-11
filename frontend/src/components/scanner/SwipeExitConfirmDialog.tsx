import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogOut } from "lucide-react";
import { formatCountdown, resolveAutoSignoutCountdownCopy } from "@/utils/formatCountdown";
import { SCAN_NESTED_BACKDROP, SCAN_MODAL_LAYER_PROPS } from "./scanPopupTheme";

interface SwipeExitConfirmDialogProps {
    open: boolean;
    userName: string;
    roomName: string;
    onConfirm: () => void;
    onCancel: () => void;
    /** 自动签退剩余秒数（来自 analyze）；null/undefined 则不显示倒计时区块 */
    autoSignoutSeconds?: number | null;
    /** PENDING_ACTIVATION / AUTO_EXIT_SCHEDULED；用于区分激活与签退倒计时文案 */
    autoSignoutState?: string | null;
    /** 倒计时归零回调：关闭弹窗 + 刷新状态 */
    onCountdownEnd?: () => void;
}

export function SwipeExitConfirmDialog({
    open,
    userName,
    roomName,
    onConfirm,
    onCancel,
    autoSignoutSeconds,
    autoSignoutState,
    onCountdownEnd,
}: SwipeExitConfirmDialogProps) {
    const [countdown, setCountdown] = useState<number | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hasEndedRef = useRef(false);

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

    // 归零时触发回调（仅一次）
    useEffect(() => {
        if (countdown === 0 && !hasEndedRef.current) {
            hasEndedRef.current = true;
            // 短暂延迟让用户看到 00:00
            const t = setTimeout(() => {
                onCountdownEnd?.();
            }, 800);
            return () => clearTimeout(t);
        }
    }, [countdown, onCountdownEnd]);

    const showCountdown = countdown != null && countdown > 0;
    const countdownCopy = resolveAutoSignoutCountdownCopy(autoSignoutState);

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    {...SCAN_MODAL_LAYER_PROPS}
                    className={`fixed inset-0 z-[var(--z-modal)] flex items-center justify-center ${SCAN_NESTED_BACKDROP}`}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") onCancel();
                    }}
                >
                    {/* Backdrop click to cancel */}
                    <div className="absolute inset-0" onClick={onCancel} />

                    {/* Card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 20 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="relative z-10 mx-4 w-full max-w-[400px] overflow-hidden rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-[var(--app-elevation-modal)]"
                    >
                        {/* Close button */}
                        <button
                            onClick={onCancel}
                            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)] transition-colors hover:bg-[var(--app-color-surface-active)] hover:text-[var(--app-color-text-primary)]"
                            title="取消 Esc"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="p-8 pt-10">
                            {/* Icon */}
                            <div className="flex justify-center mb-5">
                                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--app-color-feedback-danger)]/30 bg-[var(--app-color-feedback-danger-soft)]">
                                    <LogOut className="h-6 w-6 text-[var(--app-color-feedback-danger)]" />
                                </div>
                            </div>

                            {/* Title */}
                            <h2 className="mb-2 text-center text-lg font-bold text-[var(--app-color-text-primary)]">
                                确认离开
                            </h2>

                            {/* Auto-Signout Countdown Section */}
                            {showCountdown && (
                                <div className="mb-4 rounded-[var(--app-radius-element)] border border-[var(--app-color-feedback-warning)]/25 bg-[var(--app-color-feedback-warning-soft)] p-3">
                                    <div className="mb-1.5 flex items-center justify-center gap-2">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--app-color-feedback-warning)]">
                                            {countdownCopy.badge}
                                        </span>
                                        <span className="font-mono text-2xl font-bold tracking-wider text-[var(--app-color-feedback-warning)]">
                                            {formatCountdown(countdown!)}
                                        </span>
                                    </div>
                                    <p className="text-center text-[11px] leading-snug text-[var(--app-color-text-secondary)]">
                                        {countdownCopy.hint}
                                    </p>
                                </div>
                            )}

                            {/* User & Room Info */}
                            <div className="text-center mb-5 space-y-1">
                                <p className="text-sm text-[var(--app-color-text-secondary)]">
                                    <span className="font-semibold text-[var(--app-color-text-primary)]">{userName || "未知人员"}</span>
                                </p>
                                <p className="text-[13px] text-[var(--app-color-text-tertiary)]">
                                    当前处于<span className="font-semibold text-[var(--app-color-feedback-warning)]">进入</span>状态，将离开{" "}
                                    <span className="font-semibold text-[var(--app-color-text-primary)]">{roomName || "当前房间"}</span>
                                </p>
                            </div>

                            {/* Divider */}
                            <div className="mb-6 border-t border-[var(--app-color-border-default)]" />

                            {/* Warning */}
                            <p className="mb-6 text-center text-[11px] leading-snug text-[var(--app-color-text-tertiary)]">
                                离开后门禁权限将被回收，如需再次进入请重新扫码
                            </p>

                            {/* Buttons */}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] py-2.5 text-sm font-semibold text-[var(--app-color-text-secondary)] transition-colors hover:bg-[var(--app-color-surface-active)] hover:text-[var(--app-color-text-primary)]"
                                >
                                    取消
                                </button>
                                <button
                                    type="button"
                                    onClick={onConfirm}
                                    className="flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-feedback-danger)]/40 bg-[var(--app-color-feedback-danger-soft)] py-2.5 text-sm font-bold text-[var(--app-color-feedback-danger)] transition-colors hover:border-[var(--app-color-feedback-danger)]/60 hover:bg-[var(--app-color-feedback-danger-soft)]"
                                >
                                    确认离开
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
