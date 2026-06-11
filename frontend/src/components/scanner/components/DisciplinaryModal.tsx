import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, PowerOff, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { DisciplinaryRecord } from "@/api/types/scanner";
import { SCAN_NESTED_BACKDROP, SCAN_MODAL_LAYER_PROPS } from "../scanPopupTheme";

interface DisciplinaryModalProps {
    isOpen: boolean;
    records: DisciplinaryRecord[];
    currentState: number;
    onClose: () => void;
    onToggle: (newValid: boolean) => Promise<void>;
    /** 学生等低权限角色不展示封禁/解禁开关，仅可查看记录 */
    showStateToggle?: boolean;
}

export const DisciplinaryModal = ({
    isOpen,
    records,
    currentState,
    onClose,
    onToggle,
    showStateToggle = true,
}: DisciplinaryModalProps) => {
    const [isToggling, setIsToggling] = useState(false);
    const isBlocked = currentState === 3;
    if (!isOpen) return null;
    const handleToggle = async () => {
        setIsToggling(true);
        try {
            await onToggle(currentState === 3);
        } finally {
            setIsToggling(false);
        }
    };
    return createPortal(
        <motion.div {...SCAN_MODAL_LAYER_PROPS} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`fixed inset-0 z-[var(--z-modal)] flex items-center justify-center ${SCAN_NESTED_BACKDROP}`}>
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="w-[500px] overflow-hidden rounded-[var(--app-radius-container)] border border-[var(--app-color-feedback-danger)]/30 bg-[var(--app-color-surface-container)] shadow-[var(--app-elevation-modal)]"
            >
                <div className="flex items-center justify-between border-b border-[var(--app-color-border-default)] px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--app-color-feedback-danger)]/20 bg-[var(--app-color-feedback-danger-soft)]">
                            {currentState === 3 ? (
                                <ShieldAlert className="h-5 w-5 text-[var(--app-color-feedback-danger)]" />
                            ) : (
                                <ShieldCheck className="h-5 w-5 text-[var(--app-color-feedback-success)]" />
                            )}
                        </div>
                        <h2 className="text-lg font-black tracking-wider text-[var(--app-color-text-primary)]">人员违规拦截触发</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-[var(--app-color-text-tertiary)] transition-colors hover:text-[var(--app-color-text-primary)]">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="max-h-[260px] overflow-y-auto p-6 [&::-webkit-scrollbar]:hidden">
                    {records.length === 0 ? (
                        <div className="py-4 text-center text-sm text-[var(--app-color-text-tertiary)]">无历史违规记录</div>
                    ) : (
                        records.map((rec) => (
                            <div key={rec.id} className="mb-3">
                                <div className="text-xs font-bold text-[var(--app-color-feedback-danger)]">
                                    {rec.createTime} · {rec.operateName}
                                </div>
                                <p className="mt-1 rounded-[var(--app-radius-element)] bg-[var(--app-color-feedback-danger-soft)] p-2 text-sm text-[var(--app-color-text-primary)]">
                                    {rec.record || "【无具体记录描述】"}
                                </p>
                            </div>
                        ))
                    )}
                </div>
                {showStateToggle ? (
                    <div className="flex items-center justify-between border-t border-[var(--app-color-border-default)] px-6 py-5">
                        <span className="text-sm font-bold text-[var(--app-color-text-primary)]">
                            强制接管 ARO 底层状态
                            <span className={`ml-2 text-xs ${isBlocked ? "text-[var(--app-color-feedback-danger)]" : "text-[var(--app-color-feedback-success)]"}`}>
                                {isBlocked ? "当前：已封禁" : "当前：正常"}
                            </span>
                        </span>
                        <button
                            disabled={isToggling}
                            onClick={handleToggle}
                            className={`relative flex h-8 w-16 items-center rounded-full border transition-colors ${
                                isBlocked
                                    ? "border-[var(--app-color-feedback-danger)]/50 bg-[var(--app-color-feedback-danger-soft)]"
                                    : "border-[var(--app-color-feedback-success)]/50 bg-[var(--app-color-feedback-success-soft)]"
                            }`}
                        >
                            <div
                                className={`absolute flex h-6 w-6 items-center justify-center rounded-full transition-transform ${
                                    isBlocked
                                        ? "translate-x-1 bg-[var(--app-color-feedback-danger)]"
                                        : "translate-x-9 bg-[var(--app-color-feedback-success)]"
                                }`}
                            >
                                {isToggling ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--app-color-text-inverse)]" />
                                ) : (
                                    <PowerOff className="h-3 w-3 text-[var(--app-color-text-inverse)]" />
                                )}
                            </div>
                        </button>
                    </div>
                ) : null}
            </motion.div>
        </motion.div>,
        document.body
    );
};
