import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, DoorOpen } from "lucide-react";
import { SCAN_MODAL_LAYER_PROPS } from "./scanPopupTheme";
import { useTheme } from "@/features/theme/ThemeProvider";

interface RoomEnterConfirmDialogProps {
    open: boolean;
    userName: string;
    roomName: string;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * 进入房间二次确认弹窗
 *
 * 动画时序：
 *   1. 用户点击「进入 XX」→ AnimatedRoomButton 过渡到「确认」状态（~400ms）
 *   2. 本弹窗 scale + fade 进入（250ms spring）
 *   3. 确认 → 执行进入、弹窗消失；取消/关闭 → 弹窗消失、按钮回退
 *
 * 主题：完全适配明暗主题，使用 --app-color-* 语义令牌。
 */
export function RoomEnterConfirmDialog({
    open,
    userName,
    roomName,
    onConfirm,
    onCancel,
}: RoomEnterConfirmDialogProps) {
    const { theme } = useTheme();
    const isDark = theme.mode === "dark";

    return createPortal(
        <div className={`${theme.className} ${isDark ? "dark" : ""}`}>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        {...SCAN_MODAL_LAYER_PROPS}
                        className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
                        style={{
                            background: isDark
                                ? "rgba(0,0,0,0.65)"
                                : "rgba(0,0,0,0.45)",
                            backdropFilter: "blur(6px)",
                            WebkitBackdropFilter: "blur(6px)",
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") onCancel();
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 24 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 16 }}
                            transition={{
                                duration: 0.28,
                                ease: [0.16, 1, 0.3, 1],
                            }}
                            className="relative z-10 mx-4 w-full max-w-[400px] overflow-hidden rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-[var(--app-elevation-modal)]"
                        >
                            {/* 关闭按钮 */}
                            <button
                                onClick={onCancel}
                                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)] transition-colors hover:bg-[var(--app-color-surface-active)] hover:text-[var(--app-color-text-primary)]"
                                title="取消 Esc"
                            >
                                <X className="h-4 w-4" />
                            </button>

                            <div className="p-8 pt-10">
                                {/* 图标 — 使用 accent 色系，与进入动作呼应 */}
                                <div className="mb-5 flex justify-center">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--app-color-accent)]/30 bg-[var(--app-color-accent)]/10">
                                        <DoorOpen className="h-6 w-6 text-[var(--app-color-accent)]" />
                                    </div>
                                </div>

                                {/* 标题 */}
                                <h2 className="mb-2 text-center text-lg font-bold text-[var(--app-color-text-primary)]">
                                    确认进入
                                </h2>

                                {/* 用户 & 房间信息 */}
                                <div className="mb-5 space-y-1 text-center">
                                    <p className="text-sm text-[var(--app-color-text-secondary)]">
                                        <span className="font-semibold text-[var(--app-color-text-primary)]">
                                            {userName || "未知人员"}
                                        </span>
                                    </p>
                                    <p className="text-[13px] text-[var(--app-color-text-tertiary)]">
                                        即将进入{" "}
                                        <span className="font-semibold text-[var(--app-color-text-primary)]">
                                            {roomName || "目标空间"}
                                        </span>
                                    </p>
                                </div>

                                {/* 分割线 */}
                                <div className="mb-6 border-t border-[var(--app-color-border-default)]" />

                                {/* 提示 */}
                                <p className="mb-6 text-center text-[11px] leading-snug text-[var(--app-color-text-tertiary)]">
                                    进入后将获得门禁权限，离开时请再次扫码签退
                                </p>

                                {/* 操作按钮 */}
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
                                        className="flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-accent)]/40 bg-[var(--app-color-accent)]/15 py-2.5 text-sm font-bold text-[var(--app-color-accent)] transition-colors hover:border-[var(--app-color-accent)]/60 hover:bg-[var(--app-color-accent)]/25"
                                    >
                                        确认进入
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>,
        document.body,
    );
}