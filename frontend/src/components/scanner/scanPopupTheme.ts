/** 扫码弹窗性别差异化强调色（暖桃 / 钢蓝），均引用设计令牌 */
export type ScanAccentVariant = "warm" | "cool";

export function resolveScanAccentVariant(gender?: string | number | null): ScanAccentVariant {
  return String(gender) === "2" ? "warm" : "cool";
}

export function resolveScanAccentCss(variant: ScanAccentVariant) {
  const isWarm = variant === "warm";
  return {
    isWarm,
    accent: isWarm ? "var(--color-peach-400)" : "var(--app-color-accent)",
    accentStrong: isWarm ? "var(--color-peach-500)" : "var(--app-color-accent-hover)",
    accentSoft: isWarm ? "var(--color-peach-950)" : "var(--app-color-accent-soft)",
    strokeEntry: isWarm ? "var(--color-peach-400)" : "var(--color-steel-400)",
    strokeExit: isWarm ? "var(--color-peach-600)" : "var(--color-steel-500)",
    fillArea: isWarm ? "color-mix(in srgb, var(--color-peach-400) 16%, transparent)" : "color-mix(in srgb, var(--color-steel-400) 16%, transparent)",
    gridStroke: "color-mix(in srgb, var(--app-color-border-default) 60%, transparent)",
  };
}

/** 弹窗遮罩：实色底 + 轻模糊，避免透出下层页面 */
export const SCAN_POPUP_BACKDROP =
  "bg-[var(--app-color-surface-page)] backdrop-blur-sm";

/** 子弹窗遮罩：叠在扫码弹窗之上 */
export const SCAN_NESTED_BACKDROP =
  "bg-[color-mix(in_srgb,var(--app-color-surface-page)_88%,transparent)] backdrop-blur-md";

/** 主面板卡片：最高 elevation，用于 ProfileHeader / StudentEntryCard / AIPredictionCard */
export const SCAN_PANEL_CARD =
  "rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-[var(--app-elevation-modal)]";

/** 内部子卡片：嵌在面板内的次级容器 */
export const SCAN_INNER_CARD =
  "rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]";

/** 玻璃态按钮底托：半透明 + 模糊 */
export const SCAN_GLASS_TRAY =
  "rounded-xl border border-white/[0.06] bg-[var(--app-color-surface-container)]/60 backdrop-blur-md";
