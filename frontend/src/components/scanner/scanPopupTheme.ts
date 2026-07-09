export type ScanAccentVariant = "warm" | "cool";

export function resolveScanAccentVariant(gender?: string | number | null): ScanAccentVariant {
  return String(gender) === "2" ? "warm" : "cool";
}

/** 统一扫码弹窗配色：Bento 暖桃 #FAD4C0 + 钢蓝 #80A1C1，同色相明度阶梯 */
export type ScanPalette = {
  accent: string;
  accentStrong: string;
  /** 浅色卡片上的可读强调色（对比度 ≥ 4.5:1） */
  accentInk: string;
  accentSecondary: string;
  accentGradient: string;
  glow: string;
  chartStrokeEntry: string;
  chartStrokeExit: string;
  chartFill: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  expTrack: string;
  expGradient: string;
  profileBg: string;
  profileBgDark: string;
  profileBorder: string;
  studentBg: string;
  studentBgDark: string;
  aiBg: string;
  aiBgDark: string;
};

export const SCAN_PALETTE: ScanPalette = {
  accent: "#FAD4C0",
  accentStrong: "#E8A88C",
  accentInk: "#B86B4F",
  accentSecondary: "#80A1C1",
  accentGradient: "linear-gradient(135deg, #FFF5E6, #FAD4C0, #E8A88C)",
  glow: "rgba(250,212,192,0.28)",
  chartStrokeEntry: "#E8A88C",
  chartStrokeExit: "#80A1C1",
  chartFill: "rgba(250,212,192,0.22)",
  badgeBg: "#1e1816",
  badgeBorder: "#FAD4C0",
  badgeText: "#FAD4C0",
  expTrack: "#1e1816",
  expGradient: "linear-gradient(90deg, rgba(250,212,192,0.45), rgba(232,168,140,0.75))",
  profileBg: "#FFF0ED",
  profileBgDark: "#1e1816",
  profileBorder: "#FAD4C0",
  studentBg: "#FFF5F0",
  studentBgDark: "#1c1816",
  aiBg: "#FFFAF8",
  aiBgDark: "#1b1817",
};

/** 图表/内联样式用；入场暖桃、离场钢蓝，不再按性别分叉 */
export function resolveScanAccentCss(_variant?: ScanAccentVariant) {
  const p = SCAN_PALETTE;
  return {
    isWarm: true,
    accent: p.accentInk,
    accentStrong: p.accentStrong,
    accentOnDark: p.accent,
    strokeEntry: p.chartStrokeEntry,
    strokeExit: p.chartStrokeExit,
    fillArea: p.chartFill,
    gridStroke: `color-mix(in srgb, ${p.accentSecondary} 22%, var(--app-color-border-default))`,
  };
}

/** 业务操作类弹窗（绑卡、disciplinary 等）用实色底；公告/违规/未绑卡详情见 ScanPopupNoticeBanner */
export const SCAN_NESTED_BACKDROP =
  "bg-[var(--app-color-surface-page)] isolate [contain:paint]";

/** 全屏遮罩：多色渐变 + 辉光球（样式见 scanPopupNotice.css `.scan-popup-backdrop`） */
export const SCAN_POPUP_BACKDROP =
  "scan-popup-backdrop backdrop-blur-md [contain:paint] isolate";

export const SCAN_MODAL_LAYER_PROPS = {
  "data-modal-layer": "true",
  "data-scan-overlay": "true",
} as const;

const CARD_SHADOW =
  "shadow-[0_2px_10px_var(--scan-glow),0_8px_24px_color-mix(in_srgb,var(--scan-accent)_18%,transparent),0_14px_40px_color-mix(in_srgb,var(--app-color-text-primary)_6%,transparent)]";

const CARD_SHADOW_DARK =
  "dark:shadow-[0_4px_18px_var(--scan-glow),0_12px_36px_color-mix(in_srgb,var(--app-color-text-primary)_42%,transparent)]";

/** ProfileHeader — 最深档暖桃底 */
export const PROFILE_CARD =
  `scan-profile-card rounded-[var(--app-radius-container)] border-0 ${CARD_SHADOW} ${CARD_SHADOW_DARK} relative overflow-hidden`;

/** StudentEntryCard — 中档暖桃底 */
export const STUDENT_CARD =
  `scan-student-card rounded-[var(--app-radius-container)] border-0 ${CARD_SHADOW} ${CARD_SHADOW_DARK}`;

/** AIPredictionCard — 最浅档暖桃底 */
export const AI_CARD =
  `scan-ai-card rounded-[var(--app-radius-container)] border-0 ${CARD_SHADOW} ${CARD_SHADOW_DARK}`;

/** 周曲线图卡；读 --scan-card-tint / --scan-chart-* */
export const CHART_CARD = "scan-weekly-chart-card";

// ═══ 公告灵动岛 — 按类型着色（组件令牌见 scan-notice-theme.css） ═══

export type NoticeKind = "announcement" | "violation" | "unbound" | "cage-notice";

export function noticeThemeClass(kind: NoticeKind): string {
  return `scan-notice-theme-${kind}`;
}

export type ScanPopupNoticeMeta = {
  islandTag: string;
  dialogCategory: string;
  titleId: string;
  emptyBodyHint: string;
  imageAlt: string;
};

export function resolveScanPopupNoticeMeta(kind: NoticeKind): ScanPopupNoticeMeta {
  if (kind === "announcement") {
    return {
      islandTag: "Notice",
      dialogCategory: "系统公告",
      titleId: "scan-announcement-title",
      emptyBodyHint: "暂无正文内容。",
      imageAlt: "公告附图",
    };
  }
  if (kind === "unbound") {
    return {
      islandTag: "Unbound",
      dialogCategory: "未绑卡提示",
      titleId: "unbound-notice-title",
      emptyBodyHint: "未填写文字说明，请查看附图或联系管理员。",
      imageAlt: "未绑卡提示附图",
    };
  }
  if (kind === "cage-notice") {
    return {
      islandTag: "Cage",
      dialogCategory: "笼位处理提示",
      titleId: "cage-notice-title",
      emptyBodyHint: "未填写文字说明，请查看附图或联系管理员。",
      imageAlt: "笼位附图",
    };
  }
  return {
    islandTag: "Alert",
    dialogCategory: "违规通告",
    titleId: "violation-notice-title",
    emptyBodyHint: "未填写文字说明，请查看附图或联系管理员。",
    imageAlt: "违规附图",
  };
}

export const ACCESS_NOTICE_CARD_BASE = "scan-access-notice-card";

/** 重复刷卡警告弹窗 */
export const SCAN_WARNING_PANEL = "scan-warning-panel";

export const INNER_ROW = "scan-inner-row rounded-[var(--app-radius-element)]";

export const TOGGLE_TRAY =
  "rounded-xl bg-[var(--app-color-surface-hover)] border border-[var(--app-color-border-default)]";

/**
 * 扫码弹窗运行时 CSS 变量（挂在 UiverseProfilePopup Portal 根 div 的 style 上）。
 * --scan-card-tint ← studentBg，与 StudentEntryCard / 周曲线外框同档。
 */
export function scanPaletteCssVars(palette: ScanPalette = SCAN_PALETTE): Record<string, string> {
  return {
    "--scan-accent": palette.accent,
    "--scan-accent-strong": palette.accentStrong,
    "--scan-accent-ink": palette.accentInk,
    "--scan-accent-secondary": palette.accentSecondary,
    "--scan-accent-gradient": palette.accentGradient,
    "--scan-glow": palette.glow,
    "--scan-chart-entry": palette.chartStrokeEntry,
    "--scan-chart-exit": palette.chartStrokeExit,
    "--scan-chart-fill": palette.chartFill,
    "--scan-chart-grid": `color-mix(in srgb, ${palette.accentSecondary} 22%, var(--app-color-border-default))`,
    "--scan-badge-bg": palette.badgeBg,
    "--scan-badge-border": palette.badgeBorder,
    "--scan-badge-text": palette.badgeText,
    "--scan-exp-track": palette.expTrack,
    "--scan-exp-gradient": palette.expGradient,
    "--scan-profile-bg": palette.profileBg,
    "--scan-profile-bg-dark": palette.profileBgDark,
    "--scan-profile-border": palette.profileBorder,
    "--scan-student-bg": palette.studentBg,
    "--scan-student-bg-dark": palette.studentBgDark,
    "--scan-ai-bg": palette.aiBg,
    "--scan-ai-bg-dark": palette.aiBgDark,
    "--scan-card-tint": palette.studentBg,
    "--scan-card-tint-dark": palette.studentBgDark,
    /* 遮罩渐变见 semantic.css --app-color-scan-backdrop-*，勿复用卡片底色 */
  };
}

/** @deprecated 使用 scanPaletteCssVars */
export const schemeCssVars = scanPaletteCssVars;
