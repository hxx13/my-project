import { motion } from "framer-motion";

interface ScanLevelBadgeProps {
  level: number;
  exp: number;
  nextLevelExp: number;
  name: string;
}

/**
 * 自定义等级经验徽章组件。
 * 深暖棕底色 + 琥珀渐变边框 + 琥珀→橙渐变经验条。
 * 色彩始终固定，不随亮/暗主题变化，确保文字始终可读。
 */
export function ScanLevelBadge({ level, exp, nextLevelExp, name }: ScanLevelBadgeProps) {
  const pct = Math.max(0, Math.min(100, (exp / Math.max(1, nextLevelExp)) * 100));

  return (
    <div className="relative w-[280px] h-[52px] flex items-center">
      {/* ── 等级圆徽章 ── */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        className="relative z-20 flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
        style={{
          background: "linear-gradient(135deg, #1c1410 0%, #2d1f16 100%)",
          border: `2px solid var(--scan-badge-border)`,
          boxShadow: `0 4px 16px color-mix(in srgb, var(--scan-badge-border) 25%, transparent)`,
        }}
      >
        <div className="flex flex-col items-center justify-center -space-y-0.5">
          <span className="text-[8px] font-black tracking-[0.15em]"
                style={{ color: 'var(--scan-accent)' }}>
            LV
          </span>
          <span className="font-black text-base text-white leading-none">
            {level}
          </span>
        </div>
      </motion.div>

      {/* ── 名字 + 经验条 ── */}
      <div className="relative z-10 -ml-3 flex h-[40px] flex-1 flex-col justify-between pt-0.5">
        {/* 名字 */}
        <div className="z-30 flex items-center pl-5">
          <span className="truncate text-[12px] font-bold text-slate-800 dark:text-warm-50">
            {name || "未知人员"}
          </span>
        </div>

        {/* EXP 条 */}
        <div
          className="relative flex h-[22px] items-center overflow-hidden rounded-r-full border pl-5 pr-2"
          style={{
            background: "linear-gradient(180deg, #1c1410 0%, #2d1f16 100%)",
            borderColor: `color-mix(in srgb, var(--scan-badge-border) 15%, transparent)`,
          }}
        >
          {/* 填充 */}
          <motion.div
            className="absolute left-0 top-0 bottom-0 z-0"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              background: "var(--scan-exp-gradient)",
            }}
          />
          {/* 文字 */}
          <div className="relative z-20 flex w-full items-center justify-between">
            <span className="text-[8px] font-black tracking-[0.15em] text-amber-400/80">
              EXP
            </span>
            <span className="font-mono text-[9px] font-black text-white">
              {exp}
              <span className="text-amber-400/40"> / {nextLevelExp}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}