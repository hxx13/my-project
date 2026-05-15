import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, PowerOff, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { DisciplinaryRecord } from "@/api/types/scanner";

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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/70 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-[500px] bg-gradient-to-br from-[#180a0a] to-[#0a0505] border border-red-900/50 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-red-900/30">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                            {currentState === 3 ? <ShieldAlert className="w-5 h-5 text-red-500" /> : <ShieldCheck className="w-5 h-5 text-green-500" />}
                        </div>
                        <h2 className="text-lg font-black tracking-wider text-red-50">人员违规拦截触发</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 max-h-[260px] overflow-y-auto [&::-webkit-scrollbar]:hidden">
                    {records.length === 0 ? <div className="text-center text-slate-500 text-sm py-4">无历史违规记录</div> : records.map((rec) => (
                        <div key={rec.id} className="mb-3">
                            <div className="text-xs font-bold text-red-300">{rec.createTime} · {rec.operateName}</div>
                            <p className="text-sm text-slate-300 bg-red-500/5 p-2 rounded-md mt-1">{rec.record || "【无具体记录描述】"}</p>
                        </div>
                    ))}
                </div>
                {showStateToggle ? (
                    <div className="px-6 py-5 border-t border-red-900/30 flex items-center justify-between">
                        <span className="text-sm font-bold text-white">
                            强制接管 ARO 底层状态
                            <span className={`ml-2 text-xs ${isBlocked ? "text-red-300" : "text-emerald-300"}`}>
                                {isBlocked ? "当前：已封禁" : "当前：正常"}
                            </span>
                        </span>
                        <button
                            disabled={isToggling}
                            onClick={handleToggle}
                            className={`relative flex items-center w-16 h-8 rounded-full border transition-colors ${
                                isBlocked
                                    ? "bg-red-500/20 border-red-500/50"
                                    : "bg-emerald-500/20 border-emerald-500/50"
                            }`}
                        >
                            <div
                                className={`absolute w-6 h-6 rounded-full flex items-center justify-center transition-transform ${
                                    isBlocked ? "bg-red-500 translate-x-1" : "bg-emerald-500 translate-x-9"
                                }`}
                            >
                                {isToggling ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <PowerOff className="w-3 h-3 text-white" />}
                            </div>
                        </button>
                    </div>
                ) : null}
            </motion.div>
        </motion.div>,
        document.body
    );
};
