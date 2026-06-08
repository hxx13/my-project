import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Delete } from "lucide-react";
import { Z_INDEX } from "@/constants/zIndex";
import { useNumericKeypad } from "./useNumericKeypad";
import type { NumericKeypadProps } from "./NumericKeypad.types";

const LAYOUT = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [-1, 0, -2], // -1: empty, -2: delete
];

export function NumericKeypad(props: NumericKeypadProps) {
  const { mode, userId, userName, onSuccess, onCancel, className = "" } = props;
  const kp = useNumericKeypad(mode, userId, onSuccess, onCancel);

  const title = mode === "set" ? "设置个人密码" : "验证个人密码";
  const displayName = userName || userId;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        style={{ zIndex: Z_INDEX.keypad }}
      >
        <motion.div
          initial={{ scale: 0.9, y: 40, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, y: 40, opacity: 0 }}
          className={`w-full max-w-[320px] rounded-3xl bg-[#0f172a] border border-white/10 shadow-2xl p-6 ${className}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-lg font-bold">{title}</h2>
            <button onClick={kp.handleCancel} className="text-white/60 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Subtitle */}
          <p className="text-slate-400 text-xs text-center mb-6">
            {mode === "set" && kp.step === "confirming"
              ? "请再次输入以确认"
              : `为 ${displayName} 输入 6-8 位数字密码`}
          </p>

          {/* Dots indicator */}
          <div className="flex justify-center gap-2 mb-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-colors duration-200 ${
                  i < kp.dots.length
                    ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                    : "bg-white/10"
                }`}
              />
            ))}
          </div>

          {/* Error text */}
          {kp.errorText && (
            <p className="text-red-400 text-xs text-center mb-4">{kp.errorText}</p>
          )}

          {/* Lock countdown */}
          {kp.isLocked && (
            <p className="text-amber-400 text-sm text-center mb-4 font-bold">
              已锁定，{kp.lockSeconds} 秒后重试
            </p>
          )}

          {/* Keypad grid */}
          <div className="grid grid-cols-3 gap-2">
            {LAYOUT.flat().map((key, i) => {
              if (key === -1) return <div key={`empty-${i}`} />;
              if (key === -2) {
                return (
                  <button
                    key="delete"
                    onClick={kp.handleDelete}
                    disabled={kp.isLocked || kp.isLoading}
                    className="h-14 rounded-xl bg-white/5 flex items-center justify-center
                               text-white/60 hover:bg-white/10 disabled:opacity-30 transition-colors"
                    aria-label="删除"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  onClick={() => kp.handleDigit(key)}
                  disabled={kp.isLocked || kp.isLoading}
                  className="h-14 rounded-xl bg-white/10 flex items-center justify-center
                             text-white text-xl font-bold hover:bg-white/20 active:bg-white/30
                             disabled:opacity-30 transition-colors"
                >
                  {key}
                </button>
              );
            })}
          </div>

          {/* Submit button */}
          <button
            onClick={kp.handleSubmit}
            disabled={kp.dots.length < 6 || kp.isLocked || kp.isLoading}
            className="w-full mt-4 h-12 rounded-xl bg-cyan-500 text-white font-bold
                       hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {kp.isLoading ? "处理中..." : kp.step === "confirming" ? "确认设置" : "提交"}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
