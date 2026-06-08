import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogOut } from "lucide-react";

interface SwipeExitConfirmDialogProps {
    open: boolean;
    userName: string;
    roomName: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export function SwipeExitConfirmDialog({
    open,
    userName,
    roomName,
    onConfirm,
    onCancel,
}: SwipeExitConfirmDialogProps) {
    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[100000] flex items-center justify-center bg-[#020617]/90 backdrop-blur-md"
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
                        className="relative z-10 w-full max-w-[400px] mx-4 rounded-2xl border border-white/15 bg-[#0f172a]/95 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden"
                    >
                        {/* Close button */}
                        <button
                            onClick={onCancel}
                            className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            title="取消 Esc"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="p-8 pt-10">
                            {/* Icon */}
                            <div className="flex justify-center mb-5">
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 border border-red-400/30">
                                    <LogOut className="w-6 h-6 text-red-400" />
                                </div>
                            </div>

                            {/* Title */}
                            <h2 className="text-center text-lg font-bold text-white mb-2">
                                确认离开
                            </h2>

                            {/* User & Room Info */}
                            <div className="text-center mb-5 space-y-1">
                                <p className="text-sm text-white/80">
                                    <span className="font-semibold text-white">{userName || "未知人员"}</span>
                                </p>
                                <p className="text-[13px] text-slate-400">
                                    当前处于<span className="text-amber-400 font-semibold">进入</span>状态，将离开{" "}
                                    <span className="text-white font-semibold">{roomName || "当前房间"}</span>
                                </p>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-white/8 mb-6" />

                            {/* Warning */}
                            <p className="text-[11px] text-slate-500 text-center mb-6 leading-snug">
                                离开后门禁权限将被回收，如需再次进入请重新扫码
                            </p>

                            {/* Buttons */}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="flex-1 py-2.5 rounded-xl border border-white/15 bg-white/5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    type="button"
                                    onClick={onConfirm}
                                    className="flex-1 py-2.5 rounded-xl border border-red-500/40 bg-red-500/20 text-sm font-bold text-red-300 hover:bg-red-500/30 hover:text-red-200 transition-colors shadow-lg shadow-red-900/20"
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
