import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogOut, Smartphone } from "lucide-react";
import { formatCountdown, resolveAutoSignoutCountdownCopy } from "@/utils/formatCountdown";
import { SCAN_MODAL_LAYER_PROPS } from "./scanPopupTheme";
import { useTheme } from "@/features/theme/ThemeProvider";
import { MobileQrCard } from "./MobileQrCard";

interface SwipeExitConfirmDialogProps {
    open: boolean;
    userName: string;
    roomName: string;
    onConfirm: () => void;
    onCancel: () => void;
    /** 自动签退剩余秒数（来自 analyze）；null/undefined 则无倒计时，按钮直接可点 */
    autoSignoutSeconds?: number | null;
    /** PENDING_ACTIVATION / AUTO_EXIT_SCHEDULED；用于区分激活与签退倒计时文案 */
    autoSignoutState?: string | null;
    /** 倒计时归零回调：关闭弹窗 + 刷新状态 */
    onCountdownEnd?: () => void;
    /** 当前扫码人 userId，用于生成手机端直达二维码 */
    studentUserId?: string;
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
    studentUserId,
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

    // 归零时：自动触发签退（仅一次）
    useEffect(() => {
        if (countdown === 0 && !hasEndedRef.current) {
            hasEndedRef.current = true;
            // 短暂延迟让用户看到 00:00，然后自动提交签退
            const t = setTimeout(() => {
                onConfirmRef.current();
                onCountdownEndRef.current?.();
            }, 600);
            return () => clearTimeout(t);
        }
    }, [countdown]);

    const showCountdown = countdown != null && countdown > 0;
    const countdownZero = countdown === 0;
    const countdownCopy = resolveAutoSignoutCountdownCopy(autoSignoutState);

    return createPortal(
        <div className={`${theme.className} ${isDark ? 'dark' : ''}`}>
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    {...SCAN_MODAL_LAYER_PROPS}
                    className="swipe-exit-confirm-anchor fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 pointer-events-none"
                    onKeyDown={(e) => {
                        if (e.key === "Escape") onCancel();
                    }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 20 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="swipe-exit-confirm-card relative z-10 mx-4 w-full max-w-[400px] overflow-hidden rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-[var(--app-elevation-modal)] pointer-events-auto"
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

                            {/* Auto-Signout Countdown — 合并到按钮上，不再独立区块 */}
                            {showCountdown && (
                                <div className="mb-4 text-center">
                                    <p className="text-[11px] leading-snug text-[var(--app-color-text-tertiary)]">
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
                            <p className="mb-5 text-center text-[11px] leading-snug text-[var(--app-color-text-tertiary)]">
                                离开后门禁权限将被回收，如需再次进入请重新扫码
                            </p>

                            {/* QR 底部横条 */}
                            {studentUserId ? (
                                <div className="scan-entry-qr-strip mb-5">
                                    <div className="scan-entry-qr-strip__info">
                                        <Smartphone className="size-[18px] shrink-0 text-[var(--app-color-text-tertiary)]" strokeWidth={1.5} />
                                        <span>扫描二维码可实时查看当前状态</span>
                                    </div>
                                    <div className="scan-entry-qr-strip__qr">
                                        <MobileQrCard userId={studentUserId} adaptive />
                                    </div>
                                </div>
                            ) : null}

                            {/* Buttons */}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] py-2.5 text-sm font-semibold text-[var(--app-color-text-secondary)] transition-colors hover:bg-[var(--app-color-surface-active)] hover:text-[var(--app-color-text-primary)]"
                                >
                                    取消
                                </button>

                                {/* 倒计时进行中：按钮变为倒计时显示，不可手动点击 */}
                                {showCountdown ? (
                                    <button
                                        type="button"
                                        disabled
                                        className="flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-feedback-warning)]/50 bg-[var(--app-color-feedback-warning-soft)] py-2.5 text-sm font-bold text-[var(--app-color-feedback-warning)] cursor-not-allowed opacity-90"
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--app-color-feedback-warning)] animate-pulse" />
                                            <span className="font-mono tracking-wider">{formatCountdown(countdown!)}</span>
                                            <span>后自动签退</span>
                                        </span>
                                    </button>
                                ) : countdownZero ? (
                                    <button
                                        type="button"
                                        disabled
                                        className="flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-feedback-success)]/40 bg-[var(--app-color-feedback-success-soft)] py-2.5 text-sm font-bold text-[var(--app-color-feedback-success)] cursor-wait"
                                    >
                                        正在签退…
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={onConfirm}
                                        className="flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-feedback-danger)]/40 bg-[var(--app-color-feedback-danger-soft)] py-2.5 text-sm font-bold text-[var(--app-color-feedback-danger)] transition-colors hover:border-[var(--app-color-feedback-danger)]/60 hover:bg-[var(--app-color-feedback-danger-soft)]"
                                    >
                                        确认离开
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
        </div>,
        document.body
    );
}
