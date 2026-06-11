import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { Z_INDEX } from "@/constants/zIndex";

type Props = {
    open: boolean;
    message: string;
    durationMs: number;
    onDismiss: () => void;
    /** 与人员弹窗一致：男/默认 #2d5cf7，女 #fbb9b6 */
    themeColor?: string;
};

function resolveNoticeTheme(themeColor?: string) {
    const isPink = themeColor === "#fbb9b6";
    const accentVar = isPink
        ? "var(--app-color-feedback-danger)"
        : "var(--app-color-accent)";
    return {
        backdrop: "bg-[var(--app-color-surface-page)]/75 backdrop-blur-md",
        card: `border-[${accentVar}]/30 bg-[var(--app-color-surface-container)] shadow-[var(--app-elevation-modal)]`,
        iconWrap: `border-[${accentVar}]/30 bg-[${accentVar}]/8`,
        icon: `text-[${accentVar}]`,
        text: "text-[var(--app-color-text-primary)]",
        label: `text-[${accentVar}]/70`,
    };
}

export function ScanAccessNoticeOverlay({ open, message, durationMs, onDismiss, themeColor }: Props) {
    const theme = useMemo(() => resolveNoticeTheme(themeColor), [themeColor]);

    useEffect(() => {
        if (!open || !message.trim()) return;
        const t = setTimeout(onDismiss, durationMs);
        return () => clearTimeout(t);
    }, [open, message, durationMs, onDismiss]);

    if (typeof document === "undefined") return null;

    return createPortal(
        <AnimatePresence>
            {open && message.trim() ? (
                <motion.div
                    key="scan-access-notice"
                    role="status"
                    aria-live="polite"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`pointer-events-none fixed inset-0 flex items-center justify-center p-6 ${theme.backdrop}`}
                    style={{ zIndex: Z_INDEX.popupNotice }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: 8 }}
                        transition={{ type: "spring", stiffness: 420, damping: 26 }}
                        className={`pointer-events-auto w-[min(92vw,520px)] rounded-[var(--app-radius-container)] border px-10 py-9 text-center backdrop-blur-xl ${theme.card}`}
                    >
                        <motion.div className="flex flex-col items-center gap-5">
                            <span
                                className={`flex h-16 w-16 items-center justify-center rounded-full border-2 ${theme.iconWrap}`}
                            >
                                <CheckCircle2 className={`h-9 w-9 ${theme.icon}`} aria-hidden strokeWidth={2.5} />
                            </span>
                            <span className={`text-[10px] font-black tracking-[0.28em] ${theme.label}`}>
                                通行成功
                            </span>
                            <p
                                className={`whitespace-pre-wrap break-words text-2xl font-black leading-snug tracking-wide sm:text-[1.65rem] ${theme.text}`}
                            >
                                {message}
                            </p>
                        </motion.div>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>,
        document.body
    );
}
