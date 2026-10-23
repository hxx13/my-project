import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, DoorOpen } from "lucide-react";
import { SCAN_MODAL_LAYER_PROPS } from "./scanPopupTheme";
import { useTheme } from "@/features/theme/ThemeProvider";
import "./scannerConfirmDialog.css";

interface RoomEnterConfirmDialogProps {
    open: boolean;
    userName: string;
    roomName: string;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * 进入房间二次确认弹窗 —— 与 ScanEntryNotice / SwipeExitConfirmDialog 共用
 * MinimizableNotice 的 .mn-* 版式，保证这一串弹窗视觉一致。
 *
 * 动画时序：
 *   1. 用户点击「进入 XX」→ AnimatedRoomButton 过渡到「确认」状态（~400ms）
 *   2. 本弹窗 scale + fade 进入（250ms）
 *   3. 确认 → 执行进入、弹窗消失；取消/关闭 → 弹窗消失、按钮回退
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
        <div className={`${theme.className} ${isDark ? "dark" : ""} minimizable-notice scan-confirm-dialog`}>
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

                            <div className="mn-icon-well">
                                <DoorOpen className="h-6 w-6" strokeWidth={2.5} />
                            </div>

                            <h2 className="mn-title">确认进入</h2>

                            <p className="mn-desc">
                                <span className="font-semibold text-[var(--app-color-text-primary)]">
                                    {userName || "未知人员"}
                                </span>
                                {" "}即将进入{" "}
                                <span className="font-semibold text-[var(--app-color-text-primary)]">
                                    {roomName || "目标空间"}
                                </span>
                            </p>

                            <p className="mn-desc">
                                进入后将获得门禁权限，离开时请再次扫码签退
                            </p>

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
                                    className="mn-btn mn-btn--primary"
                                >
                                    确认进入
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>,
        document.body,
    );
}
