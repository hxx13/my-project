import { useMemo, memo } from "react";
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

/* 单个数字按钮 — memo 避免未变化按键重渲染 */
const DigitButton = memo(function DigitButton({
  digit, onPress, disabled,
}: { digit: number; onPress: (d: number) => void; disabled: boolean }) {
  return (
    <button
      onClick={() => onPress(digit)}
      disabled={disabled}
      className="h-14 rounded-xl bg-white/10 flex items-center justify-center
                 text-white text-xl font-bold hover:bg-white/20 active:bg-white/30
                 disabled:opacity-30 transition-colors"
    >
      {digit}
    </button>
  );
});

/* 删除按钮 — memo */
const DeleteButton = memo(function DeleteButton({
  onPress, disabled,
}: { onPress: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className="h-14 rounded-xl bg-white/5 flex items-center justify-center
                 text-white/60 hover:bg-white/10 disabled:opacity-30 transition-colors"
      aria-label="删除"
    >
      <Delete className="w-5 h-5" />
    </button>
  );
});

export function NumericKeypad(props: NumericKeypadProps) {
  const { mode, userId, userName, onSuccess, onCancel, className = "", topSlot } = props;
  const kp = useNumericKeypad(mode, userId, onSuccess, onCancel);

  const title = mode === "set" ? "设置个人密码" : "验证个人密码";
  const displayName = userName || userId;
  const disabled = kp.isLocked || kp.isLoading;

  // 缓存 dots 渲染
  const dots = useMemo(() => (
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
  ), [kp.dots.length]);

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 flex flex-col items-center justify-center gap-2 p-4 bg-black/60 backdrop-blur-sm"
        style={{ zIndex: Z_INDEX.keypad }}
      >
        {topSlot}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={`w-full max-w-[320px] rounded-3xl bg-[#0f172a] border border-white/10 shadow-2xl p-6 ${className}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-lg font-bold">{title}</h2>
            <button onClick={kp.handleCancel} className="text-white/60 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Subtitle — 首次设置 vs 二次确认 vs 验证 三元区分 */}
          <div className="text-center mb-6">
            {mode === "set" && kp.step !== "confirming" ? (
              <>
                <p className="text-amber-300 text-sm font-bold mb-1">进入个人中心需设置初始密码</p>
                <p className="text-slate-400 text-xs">
                  为 {displayName} 设置 6-8 位数字密码
                </p>
              </>
            ) : mode === "set" && kp.step === "confirming" ? (
              <p className="text-slate-400 text-xs">请再次输入以确认</p>
            ) : (
              <p className="text-slate-400 text-xs">请输入你的个人密码</p>
            )}
          </div>

          {dots}

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
                  <DeleteButton key="delete" onPress={kp.handleDelete} disabled={disabled} />
                );
              }
              return (
                <DigitButton key={key} digit={key} onPress={kp.handleDigit} disabled={disabled} />
              );
            })}
          </div>

          {/* Submit button */}
          <button
            onClick={kp.handleSubmit}
            disabled={kp.dots.length < 6 || disabled}
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
