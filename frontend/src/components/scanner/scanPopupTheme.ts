export type ScanAccentVariant = "warm" | "cool";

export function resolveScanAccentVariant(gender?: string | number | null): ScanAccentVariant {
  return String(gender) === "2" ? "warm" : "cool";
}

export function resolveScanAccentCss(variant: ScanAccentVariant) {
  const isWarm = variant === "warm";
  return {
    isWarm,
    accent: isWarm ? "#fbb9b6" : "#60a5fa",
    accentStrong: isWarm ? "#fb7185" : "#3b82f6",
    accentOnDark: isWarm ? "#fca5a5" : "#93c5fd",
    strokeEntry: isWarm ? "#fb7185" : "#60a5fa",
    strokeExit: isWarm ? "#f87171" : "#a78bfa",
    fillArea: isWarm ? "rgba(251,113,133,0.18)" : "rgba(96,165,250,0.16)",
    gridStroke: "rgba(255,255,255,0.06)",
  };
}

// ═══ 遮罩：暖色渐变 + 强模糊，让白色组件立体凸起 ═══
/** 全屏遮罩：暖色渐变 + 强模糊，让白色组件立体凸起 */
export const SCAN_POPUP_BACKDROP =
  "bg-[linear-gradient(135deg,rgba(255,245,230,0.94),rgba(254,243,199,0.92),rgba(255,247,237,0.93))] dark:bg-[linear-gradient(135deg,rgba(18,16,14,0.96),rgba(28,20,16,0.94),rgba(18,16,14,0.96))] backdrop-blur-lg [contain:paint]";
export const SCAN_NESTED_BACKDROP =
  "bg-[var(--app-color-surface-page)] isolate [contain:paint]";

/** Portal 根节点属性：接入 modalScrollGuard + useModalOverlayOpen */
export const SCAN_MODAL_LAYER_PROPS = {
  "data-modal-layer": "true",
  "data-scan-overlay": "true",
} as const;

// ═══ 组件专属暖色卡片 ═══

/** ProfileHeader — 白底 + 顶部桃色渐变装饰条 */
export const PROFILE_CARD =
  "rounded-[var(--app-radius-container)] bg-white dark:bg-[#1e1b18] shadow-[0_8px_32px_rgba(0,0,0,0.10)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-[var(--app-color-border-default)] relative overflow-hidden";
/** ProfileHeader 顶部桃色装饰条 */
export const PROFILE_TOP_BAR =
  "absolute top-0 left-0 right-0 h-[3px] rounded-t-[var(--app-radius-container)]";
export const PROFILE_TOP_BAR_STYLE = {
  background: "linear-gradient(90deg, #FAD4C0, #f8b8a0, #fbb9b6)",
};

/** StudentEntryCard — 蜜色淡黄底 */
export const STUDENT_CARD =
  "rounded-[var(--app-radius-container)] bg-[#fffbeb] dark:bg-[#1c1814] shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-amber-100 dark:border-amber-900/20";

/** AIPredictionCard — 珊瑚橙色淡底 */
export const AI_CARD =
  "rounded-[var(--app-radius-container)] bg-[#fff7ed] dark:bg-[#1c1814] shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.55)] border border-orange-100 dark:border-orange-900/20";

/** 周曲线图卡 — 始终深暖棕底 */
export const CHART_CARD =
  "rounded-[var(--app-radius-container)] bg-[#1c1410] dark:bg-[#0f0b09] shadow-[0_8px_32px_rgba(0,0,0,0.35)] border border-amber-900/20";

// ═══ 公告灵动岛 — 按类型着色 ═══

export type NoticeKind = "announcement" | "violation" | "unbound";

const NOTICE_COLORS: Record<NoticeKind, { border: string; badge: string; iconBg: string; iconText: string; tag: string }> = {
  announcement: {
    border: "border-rose-400/50 dark:border-rose-400/40",
    badge: "text-rose-600 dark:text-rose-400",
    iconBg: "bg-rose-400/15",
    iconText: "text-rose-500 dark:text-rose-400",
    tag: "text-rose-400/80",
  },
  violation: {
    border: "border-amber-400/50 dark:border-amber-400/40",
    badge: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-400/15",
    iconText: "text-amber-500 dark:text-amber-400",
    tag: "text-amber-400/80",
  },
  unbound: {
    border: "border-orange-400/50 dark:border-orange-400/40",
    badge: "text-orange-600 dark:text-orange-400",
    iconBg: "bg-orange-400/15",
    iconText: "text-orange-500 dark:text-orange-400",
    tag: "text-orange-400/80",
  },
};

export function resolveNoticeColors(kind: NoticeKind) {
  return NOTICE_COLORS[kind];
}

/** 公告 Island 按钮基类 */
export const NOTICE_ISLAND_BASE =
  "rounded-full bg-white/85 dark:bg-[#1e1b18]/90 backdrop-blur-md shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-all hover:shadow-xl active:scale-[0.98]";

/** 公告弹窗面板 */
export const NOTICE_PANEL =
  "rounded-[var(--app-radius-container)] bg-white dark:bg-[#1e1b18] shadow-[0_16px_48px_rgba(0,0,0,0.15)] dark:shadow-[0_16px_48px_rgba(0,0,0,0.6)] border border-[var(--app-color-border-default)]";

/** 违规/未绑卡详情弹窗：无边框轻阴影，框架退后、正文居前 */
export const VIOLATION_NOTICE_PANEL =
  "rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-container)] shadow-[var(--app-elevation-modal)] ring-1 ring-[var(--app-color-border-default)]/40";

/** 通行成功浮层 */
export const ACCESS_NOTICE_CARD_BASE =
  "rounded-[var(--app-radius-container)] bg-white dark:bg-[#1e1b18] shadow-[0_24px_80px_rgba(0,0,0,0.15)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.7)]";

/** 内部子元素行 */
export const INNER_ROW =
  "rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-page)] dark:bg-[var(--app-color-surface-page)] border border-[var(--app-color-border-default)]";

/** 模式切换底托 */
export const TOGGLE_TRAY =
  "rounded-xl bg-[var(--app-color-surface-page)] border border-[var(--app-color-border-default)]";
