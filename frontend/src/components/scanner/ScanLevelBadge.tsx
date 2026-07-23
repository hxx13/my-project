import { motion } from "framer-motion";

interface ScanLevelBadgeProps {
  level: number;
  exp: number;
  nextLevelExp: number;
  name: string;
}

export function ScanLevelBadge({ level, exp, nextLevelExp, name }: ScanLevelBadgeProps) {
  const pct = Math.max(0, Math.min(100, (exp / Math.max(1, nextLevelExp)) * 100));

  return (
    <div className="relative w-[280px] h-[52px] flex items-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        className="relative z-20 flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
        style={{
          background: "var(--scan-badge-bg, var(--app-color-scan-badge-bg))",
          border: "2px solid var(--scan-badge-border, var(--app-color-scan-badge-border))",
          boxShadow: "0 4px 16px color-mix(in srgb, var(--scan-badge-border, var(--app-color-scan-badge-border)) 25%, transparent)",
        }}
      >
        <div className="flex flex-col items-center justify-center -space-y-0.5">
          <span
            className="text-[8px] font-black tracking-[0.15em]"
            style={{ color: "var(--scan-badge-text, var(--app-color-scan-badge-text))" }}
          >
            LV
          </span>
          <span className="font-black text-base text-[var(--app-color-text-inverse)] leading-none">
            {level}
          </span>
        </div>
      </motion.div>

      <div className="relative z-10 -ml-3 flex h-[40px] flex-1 flex-col justify-between pt-0.5">
        <div className="z-30 flex items-center pl-5">
          <span className="truncate text-[12px] font-bold text-[var(--app-color-text-primary)]">
            {name || "未知人员"}
          </span>
        </div>

        <div
          className="relative flex h-[22px] items-center overflow-hidden rounded-r-full border pl-5 pr-2"
          style={{
            background: `linear-gradient(180deg, var(--scan-exp-track, var(--app-color-scan-exp-track)) 0%, color-mix(in srgb, var(--scan-exp-track, var(--app-color-scan-exp-track)) 80%, var(--app-color-text-primary)) 100%)`,
            borderColor: "color-mix(in srgb, var(--scan-badge-border, var(--app-color-scan-badge-border)) 15%, transparent)",
          }}
        >
          <motion.div
            className="absolute left-0 top-0 bottom-0 z-0"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              background: "var(--scan-exp-gradient, linear-gradient(90deg, var(--app-color-scan-exp-fill-from), var(--app-color-scan-exp-fill-to)))",
            }}
          />
          <div className="relative z-20 flex w-full items-center justify-between">
            <span
              className="text-[8px] font-black tracking-[0.15em]"
              style={{ color: "color-mix(in srgb, var(--scan-accent, var(--app-color-scan-profile-accent)) 75%, var(--app-color-text-inverse))" }}
            >
              EXP
            </span>
            <span className="font-mono text-[9px] font-black text-[var(--app-color-text-inverse)]">
              {exp}
              <span style={{ color: "color-mix(in srgb, var(--scan-accent, var(--app-color-scan-profile-accent)) 45%, var(--app-color-text-inverse))" }}>
                {" "}/ {nextLevelExp}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
