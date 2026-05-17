import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

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
    if (isPink) {
        return {
            backdrop: "bg-[#050A15]/75 backdrop-blur-md",
            card: "border-[#fbb9b6]/45 bg-gradient-to-b from-[#1a0a12]/98 via-[#0a0510]/98 to-[#050A15]/98 shadow-[0_24px_80px_rgba(0,0,0,0.7),0_0_48px_rgba(251,185,182,0.18)]",
            iconWrap: "border-[#fbb9b6]/50 bg-[#fbb9b6]/12 shadow-[0_0_24px_rgba(251,185,182,0.25)]",
            icon: "text-[#fbb9b6]",
            text: "text-[#ffe8e6]",
            label: "text-[#fbb9b6]/80",
        };
    }
    return {
        backdrop: "bg-[#050A15]/75 backdrop-blur-md",
        card: "border-cyan-400/40 bg-gradient-to-b from-[#0a1228]/98 via-[#060d1c]/98 to-[#050A15]/98 shadow-[0_24px_80px_rgba(0,0,0,0.7),0_0_48px_rgba(45,92,247,0.22)]",
        iconWrap: "border-cyan-400/45 bg-cyan-400/10 shadow-[0_0_24px_rgba(56,189,248,0.22)]",
        icon: "text-cyan-300",
        text: "text-slate-100",
        label: "text-cyan-300/80",
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
                    className={`pointer-events-none fixed inset-0 z-[100150] flex items-center justify-center p-6 ${theme.backdrop}`}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: 8 }}
                        transition={{ type: "spring", stiffness: 420, damping: 26 }}
                        className={`pointer-events-auto w-[min(92vw,520px)] rounded-3xl border px-10 py-9 text-center backdrop-blur-xl ${theme.card}`}
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
