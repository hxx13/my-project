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
/** 业务操作类弹窗（绑卡、disciplinary 等）用实色底；公告/违规/未绑卡详情见 ScanPopupNoticeBanner，无全屏遮罩 */
export const SCAN_NESTED_BACKDROP =
  "bg-[var(--app-color-surface-page)] isolate [contain:paint]";

/** Portal 根节点属性：接入 modalScrollGuard + useModalOverlayOpen */
export const SCAN_MODAL_LAYER_PROPS = {
  "data-modal-layer": "true",
  "data-scan-overlay": "true",
} as const;

// ═══ 组件专属暖色卡片 ═══

/** ProfileHeader — 全量着色卡片（最深/最饱和色系底色） */
export const PROFILE_CARD =
  "rounded-[var(--app-radius-container)] bg-[var(--scan-profile-bg)] dark:bg-[var(--scan-profile-bg-dark)] shadow-[0_8px_32px_rgba(0,0,0,0.10)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-[var(--scan-profile-border)] relative overflow-hidden";

/** StudentEntryCard — 中等饱和度色系底色 */
export const STUDENT_CARD =
  "rounded-[var(--app-radius-container)] bg-[var(--scan-student-bg)] dark:bg-[var(--scan-student-bg-dark)] shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-amber-100/50 dark:border-amber-900/20";

/** AIPredictionCard — 最浅/最亮色系底色 */
export const AI_CARD =
  "rounded-[var(--app-radius-container)] bg-[var(--scan-ai-bg)] dark:bg-[var(--scan-ai-bg-dark)] shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.55)] border border-orange-100/50 dark:border-orange-900/20";

/**
 * 周曲线图卡（预期核心在馆时间带）— 固定深暖棕底，未绑定 SCAN_COLOR_SCHEMES。
 * 详见 frontend/src/components/scanner/docs/weekly-routine-chart-theming.md
 */
export const CHART_CARD =
  "rounded-[var(--app-radius-container)] bg-[#1c1410] dark:bg-[#0f0b09] shadow-[0_8px_32px_rgba(0,0,0,0.35)] border border-amber-900/20";

// ═══ 公告灵动岛 — 按类型着色 ═══

export type NoticeKind = "announcement" | "violation" | "unbound";

const NOTICE_COLORS: Record<NoticeKind, { bg: string; border: string; badge: string; iconBg: string; iconText: string; tag: string }> = {
  announcement: {
    bg: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-300 dark:border-rose-400/30",
    badge: "text-rose-600 dark:text-rose-300",
    iconBg: "bg-rose-100 dark:bg-rose-400/15",
    iconText: "text-rose-500 dark:text-rose-300",
    tag: "text-rose-400 dark:text-rose-300/70",
  },
  violation: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-300 dark:border-amber-400/30",
    badge: "text-amber-600 dark:text-amber-300",
    iconBg: "bg-amber-100 dark:bg-amber-400/15",
    iconText: "text-amber-500 dark:text-amber-300",
    tag: "text-amber-400 dark:text-amber-300/70",
  },
  unbound: {
    bg: "bg-orange-50 dark:bg-orange-950/40",
    border: "border-orange-300 dark:border-orange-400/30",
    badge: "text-orange-600 dark:text-orange-300",
    iconBg: "bg-orange-100 dark:bg-orange-400/15",
    iconText: "text-orange-500 dark:text-orange-300",
    tag: "text-orange-400 dark:text-orange-300/70",
  },
};

export function resolveNoticeColors(kind: NoticeKind) {
  return NOTICE_COLORS[kind];
}

/** 公告类型主题 class（立体 Island / Panel 样式，见 scanPopupNotice.css） */
export function noticeThemeClass(kind: NoticeKind): string {
  return `scan-notice-theme-${kind}`;
}

/** 公告类型 CSS 自定义属性 — 注入 Portal 根节点，供 notice island/panel 全量着色使用 */
export function noticeThemeCssVars(kind: NoticeKind): Record<string, string> {
  const colors: Record<NoticeKind, { accent: string; bg: string; bgDark: string; border: string; text: string; panelBg: string; panelBgDark: string }> = {
    announcement: {
      accent: "#fb7185",
      bg: "#fff1f2", bgDark: "#1c1014",
      border: "#fecdd3",
      text: "#be123c",
      panelBg: "#fff5f5", panelBgDark: "#1c1416",
    },
    violation: {
      accent: "#f59e0b",
      bg: "#fffbeb", bgDark: "#1c1810",
      border: "#fde68a",
      text: "#b45309",
      panelBg: "#fffbf0", panelBgDark: "#1c1810",
    },
    unbound: {
      accent: "#f97316",
      bg: "#fff7ed", bgDark: "#1c1410",
      border: "#fed7aa",
      text: "#c2410c",
      panelBg: "#fff8f0", panelBgDark: "#1c1610",
    },
  };
  const c = colors[kind];
  return {
    '--notice-accent': c.accent,
    '--notice-bg': c.bg,
    '--notice-bg-dark': c.bgDark,
    '--notice-border': c.border,
    '--notice-text': c.text,
    '--notice-panel-bg': c.panelBg,
    '--notice-panel-bg-dark': c.panelBgDark,
  };
}

/** 弹窗顶栏装饰条渐变 */
export const NOTICE_ACCENT_GRADIENT: Record<NoticeKind, string> = {
  announcement: "linear-gradient(90deg,#fb7185,#f43f5e)",
  violation: "linear-gradient(90deg,#fbbf24,#f59e0b)",
  unbound: "linear-gradient(90deg,#fb923c,#f97316)",
};

/** 弹窗底栏分隔线（按公告类型着色） */
export const NOTICE_FOOTER_BORDER: Record<NoticeKind, string> = {
  announcement: "border-rose-200/80 dark:border-rose-800/30",
  violation: "border-amber-200 dark:border-amber-800/30",
  unbound: "border-orange-200 dark:border-orange-800/30",
};

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
  return {
    islandTag: "Alert",
    dialogCategory: "违规通告",
    titleId: "violation-notice-title",
    emptyBodyHint: "未填写文字说明，请查看附图或联系管理员。",
    imageAlt: "违规附图",
  };
}

/** 公告 Island 按钮基类（不含背景色——各类型自带 nc.bg） */
export const NOTICE_ISLAND_BASE =
  "rounded-full backdrop-blur-md shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-all hover:shadow-xl active:scale-[0.98]";

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
  "rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-page)] dark:bg-[#12100e] border border-[var(--app-color-border-default)] dark:border-white/5";

/** 模式切换底托 */
export const TOGGLE_TRAY =
  "rounded-xl bg-slate-50 dark:bg-[#12100e] border border-slate-200 dark:border-white/10";

// ═══ 10 暖色方案 — 每次弹窗打开随机选取 ═══

export type ScanColorScheme = {
  id: number;
  name: string;
  accent: string;
  accentGradient: string;
  cardTint: string;
  cardTintDark: string;
  glow: string;
  chartStrokeEntry: string;
  chartStrokeExit: string;
  chartFill: string;
  islandBg: string;
  islandBgDark: string;
  islandBorder: string;
  badgeBg: string;
  badgeBorder: string;
  expGradient: string;
  /** ProfileHeader full card bg (most saturated shade) */
  profileBg: string;
  profileBgDark: string;
  profileBorder: string;
  /** StudentEntryCard full card bg (medium saturation) */
  studentBg: string;
  studentBgDark: string;
  /** AIPredictionCard full card bg (lightest shade) */
  aiBg: string;
  aiBgDark: string;
};

export const SCAN_COLOR_SCHEMES: ScanColorScheme[] = [
  {
    id: 1, name: "桃色",
    accent: "#FAD4C0",
    accentGradient: "linear-gradient(90deg, #FAD4C0, #f8b8a0, #fbb9b6)",
    cardTint: "#fff5f3", cardTintDark: "#1c1816",
    glow: "rgba(250,212,192,0.22)",
    chartStrokeEntry: "#f8b8a0", chartStrokeExit: "#fbb9b6", chartFill: "rgba(250,212,192,0.18)",
    islandBg: "bg-rose-50", islandBgDark: "dark:bg-rose-950/40",
    islandBorder: "border-rose-300 dark:border-rose-400/30",
    badgeBg: "#2d1b18", badgeBorder: "#FAD4C0",
    expGradient: "linear-gradient(90deg, rgba(250,212,192,0.25), rgba(248,184,160,0.55))",
    profileBg: "#fff0ed", profileBgDark: "#1e1816",
    profileBorder: "#f8b8a0",
    studentBg: "#fff5f3", studentBgDark: "#1c1816",
    aiBg: "#fffaf8", aiBgDark: "#1b1817",
  },
  {
    id: 2, name: "琥珀",
    accent: "#fbbf24",
    accentGradient: "linear-gradient(90deg, #fbbf24, #f59e0b, #d97706)",
    cardTint: "#fffbf0", cardTintDark: "#1c1810",
    glow: "rgba(251,191,36,0.22)",
    chartStrokeEntry: "#fbbf24", chartStrokeExit: "#f59e0b", chartFill: "rgba(251,191,36,0.18)",
    islandBg: "bg-amber-50", islandBgDark: "dark:bg-amber-950/40",
    islandBorder: "border-amber-300 dark:border-amber-400/30",
    badgeBg: "#1c1610", badgeBorder: "#fbbf24",
    expGradient: "linear-gradient(90deg, rgba(251,191,36,0.25), rgba(245,158,11,0.55))",
    profileBg: "#fef9e7", profileBgDark: "#1e1a10",
    profileBorder: "#fde68a",
    studentBg: "#fffdf5", studentBgDark: "#1c1910",
    aiBg: "#fffefa", aiBgDark: "#1b1911",
  },
  {
    id: 3, name: "珊瑚",
    accent: "#fb923c",
    accentGradient: "linear-gradient(90deg, #fb923c, #f97316, #ea580c)",
    cardTint: "#fff7f0", cardTintDark: "#1c1814",
    glow: "rgba(251,146,60,0.22)",
    chartStrokeEntry: "#fb923c", chartStrokeExit: "#f97316", chartFill: "rgba(251,146,60,0.18)",
    islandBg: "bg-orange-50", islandBgDark: "dark:bg-orange-950/40",
    islandBorder: "border-orange-300 dark:border-orange-400/30",
    badgeBg: "#1c1410", badgeBorder: "#fb923c",
    expGradient: "linear-gradient(90deg, rgba(251,146,60,0.25), rgba(249,115,22,0.55))",
    profileBg: "#ffedd5", profileBgDark: "#1e1810",
    profileBorder: "#fdba74",
    studentBg: "#fff7f0", studentBgDark: "#1c1814",
    aiBg: "#fffaf5", aiBgDark: "#1b1815",
  },
  {
    id: 4, name: "蜜色",
    accent: "#fcd34d",
    accentGradient: "linear-gradient(90deg, #fde68a, #fcd34d, #fbbf24)",
    cardTint: "#fffef5", cardTintDark: "#1c1a10",
    glow: "rgba(253,224,71,0.22)",
    chartStrokeEntry: "#fcd34d", chartStrokeExit: "#fbbf24", chartFill: "rgba(252,211,77,0.18)",
    islandBg: "bg-yellow-50", islandBgDark: "dark:bg-yellow-950/40",
    islandBorder: "border-yellow-300 dark:border-yellow-400/30",
    badgeBg: "#1c180c", badgeBorder: "#fcd34d",
    expGradient: "linear-gradient(90deg, rgba(252,211,77,0.25), rgba(251,191,36,0.55))",
    profileBg: "#fefce8", profileBgDark: "#1e1c0e",
    profileBorder: "#fde68a",
    studentBg: "#fffef7", studentBgDark: "#1c1b10",
    aiBg: "#fffffa", aiBgDark: "#1b1a11",
  },
  {
    id: 5, name: "绯红",
    accent: "#f472b6",
    accentGradient: "linear-gradient(90deg, #f9a8d4, #f472b6, #ec4899)",
    cardTint: "#fff5fa", cardTintDark: "#1c141a",
    glow: "rgba(244,114,182,0.22)",
    chartStrokeEntry: "#f472b6", chartStrokeExit: "#ec4899", chartFill: "rgba(244,114,182,0.18)",
    islandBg: "bg-pink-50", islandBgDark: "dark:bg-pink-950/40",
    islandBorder: "border-pink-300 dark:border-pink-400/30",
    badgeBg: "#1c141a", badgeBorder: "#f472b6",
    expGradient: "linear-gradient(90deg, rgba(244,114,182,0.25), rgba(236,72,153,0.55))",
    profileBg: "#fce7f3", profileBgDark: "#1e141a",
    profileBorder: "#f9a8d4",
    studentBg: "#fff0f7", studentBgDark: "#1c141a",
    aiBg: "#fff5fb", aiBgDark: "#1b1419",
  },
  {
    id: 6, name: "铜色",
    accent: "#d97706",
    accentGradient: "linear-gradient(90deg, #f59e0b, #d97706, #b45309)",
    cardTint: "#fffaf0", cardTintDark: "#1c1610",
    glow: "rgba(217,119,6,0.20)",
    chartStrokeEntry: "#d97706", chartStrokeExit: "#b45309", chartFill: "rgba(217,119,6,0.18)",
    islandBg: "bg-amber-50", islandBgDark: "dark:bg-amber-950/40",
    islandBorder: "border-amber-400 dark:border-amber-500/30",
    badgeBg: "#1c1208", badgeBorder: "#d97706",
    expGradient: "linear-gradient(90deg, rgba(217,119,6,0.25), rgba(180,83,9,0.55))",
    profileBg: "#fef3c7", profileBgDark: "#1e180e",
    profileBorder: "#fbbf24",
    studentBg: "#fffdf0", studentBgDark: "#1c1710",
    aiBg: "#fffefa", aiBgDark: "#1b180f",
  },
  {
    id: 7, name: "肉桂",
    accent: "#c2410c",
    accentGradient: "linear-gradient(90deg, #ea580c, #c2410c, #9a3412)",
    cardTint: "#fff8f0", cardTintDark: "#1c1410",
    glow: "rgba(194,65,12,0.18)",
    chartStrokeEntry: "#c2410c", chartStrokeExit: "#9a3412", chartFill: "rgba(194,65,12,0.16)",
    islandBg: "bg-orange-50", islandBgDark: "dark:bg-orange-950/40",
    islandBorder: "border-orange-400 dark:border-orange-500/30",
    badgeBg: "#1c0e08", badgeBorder: "#c2410c",
    expGradient: "linear-gradient(90deg, rgba(194,65,12,0.25), rgba(154,52,18,0.55))",
    profileBg: "#ffedd5", profileBgDark: "#1e1810",
    profileBorder: "#ea580c",
    studentBg: "#fffbf0", studentBgDark: "#1c1810",
    aiBg: "#fffdf8", aiBgDark: "#1b1811",
  },
  {
    id: 8, name: "杏色",
    accent: "#fdba74",
    accentGradient: "linear-gradient(90deg, #fed7aa, #fdba74, #fb923c)",
    cardTint: "#fffaf5", cardTintDark: "#1c1814",
    glow: "rgba(253,186,116,0.22)",
    chartStrokeEntry: "#fdba74", chartStrokeExit: "#fb923c", chartFill: "rgba(253,186,116,0.18)",
    islandBg: "bg-orange-50", islandBgDark: "dark:bg-orange-950/40",
    islandBorder: "border-orange-200 dark:border-orange-400/30",
    badgeBg: "#1c1410", badgeBorder: "#fdba74",
    expGradient: "linear-gradient(90deg, rgba(253,186,116,0.25), rgba(251,146,60,0.55))",
    profileBg: "#ffedd5", profileBgDark: "#1e1812",
    profileBorder: "#fdba74",
    studentBg: "#fffaf5", studentBgDark: "#1c1814",
    aiBg: "#fffdfa", aiBgDark: "#1b1815",
  },
  {
    id: 9, name: "樱色",
    accent: "#fda4af",
    accentGradient: "linear-gradient(90deg, #fecdd3, #fda4af, #fb7185)",
    cardTint: "#fff5f5", cardTintDark: "#1c1416",
    glow: "rgba(253,164,175,0.22)",
    chartStrokeEntry: "#fda4af", chartStrokeExit: "#fb7185", chartFill: "rgba(253,164,175,0.18)",
    islandBg: "bg-rose-50", islandBgDark: "dark:bg-rose-950/40",
    islandBorder: "border-rose-200 dark:border-rose-400/30",
    badgeBg: "#1c1416", badgeBorder: "#fda4af",
    expGradient: "linear-gradient(90deg, rgba(253,164,175,0.25), rgba(251,113,133,0.55))",
    profileBg: "#ffe4e6", profileBgDark: "#1e1416",
    profileBorder: "#fda4af",
    studentBg: "#fff0f3", studentBgDark: "#1c1416",
    aiBg: "#fff5f7", aiBgDark: "#1b1416",
  },
  {
    id: 10, name: "赤陶",
    accent: "#e8795e",
    accentGradient: "linear-gradient(90deg, #f0987a, #e8795e, #d4654a)",
    cardTint: "#fff7f3", cardTintDark: "#1c1614",
    glow: "rgba(232,121,94,0.20)",
    chartStrokeEntry: "#e8795e", chartStrokeExit: "#d4654a", chartFill: "rgba(232,121,94,0.16)",
    islandBg: "bg-red-50", islandBgDark: "dark:bg-red-950/40",
    islandBorder: "border-red-300 dark:border-red-400/30",
    badgeBg: "#1c100c", badgeBorder: "#e8795e",
    expGradient: "linear-gradient(90deg, rgba(232,121,94,0.25), rgba(212,101,74,0.55))",
    profileBg: "#fef2ee", profileBgDark: "#1e1614",
    profileBorder: "#e8795e",
    studentBg: "#fff7f5", studentBgDark: "#1c1614",
    aiBg: "#fffaf9", aiBgDark: "#1b1615",
  },
];

/** 随机选取色系（基于 sessionStorage 的递增计数器，避免同一次刷新内重复） */
export function pickRandomScheme(): ScanColorScheme {
  try {
    const raw = sessionStorage.getItem("scan-color-scheme-idx");
    let idx = raw ? (Number(raw) + 1) % SCAN_COLOR_SCHEMES.length : Math.floor(Math.random() * SCAN_COLOR_SCHEMES.length);
    sessionStorage.setItem("scan-color-scheme-idx", String(idx));
    return SCAN_COLOR_SCHEMES[idx];
  } catch {
    return SCAN_COLOR_SCHEMES[Math.floor(Math.random() * SCAN_COLOR_SCHEMES.length)];
  }
}

// ═══ 色系切换 — sessionStorage 持久化 + 跨 Portal 事件 ═══

const SCHEME_STORAGE_KEY = "scan-active-scheme-id";
export const SCAN_SCHEME_CHANGE_EVENT = "scan-scheme-changed";

/** 获取当前激活的色系（从 sessionStorage 读取，不存在则随机选取并写入） */
export function getActiveScheme(): ScanColorScheme {
  try {
    const raw = sessionStorage.getItem(SCHEME_STORAGE_KEY);
    const id = raw ? Number(raw) : null;
    if (id && SCAN_COLOR_SCHEMES.some(s => s.id === id)) {
      return SCAN_COLOR_SCHEMES.find(s => s.id === id)!;
    }
  } catch { /* ignore */ }
  const scheme = pickRandomScheme();
  try { sessionStorage.setItem(SCHEME_STORAGE_KEY, String(scheme.id)); } catch { /* ignore */ }
  return scheme;
}

/** 切换色系并写入 sessionStorage + 派发事件 */
export function setActiveScheme(id: number) {
  const scheme = SCAN_COLOR_SCHEMES.find(s => s.id === id);
  if (!scheme) return;
  try { sessionStorage.setItem(SCHEME_STORAGE_KEY, String(id)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(SCAN_SCHEME_CHANGE_EVENT, { detail: scheme })); } catch { /* ignore */ }
}

/** 生成 scheme CSS 变量对象 */
export function schemeCssVars(scheme: ScanColorScheme): Record<string, string> {
  return {
    '--scan-accent': scheme.accent,
    '--scan-accent-gradient': scheme.accentGradient,
    '--scan-card-tint': scheme.cardTint,
    '--scan-card-tint-dark': scheme.cardTintDark,
    '--scan-glow': scheme.glow,
    '--scan-chart-entry': scheme.chartStrokeEntry,
    '--scan-chart-exit': scheme.chartStrokeExit,
    '--scan-chart-fill': scheme.chartFill,
    '--scan-badge-bg': scheme.badgeBg,
    '--scan-badge-border': scheme.badgeBorder,
    '--scan-exp-gradient': scheme.expGradient,
    '--scan-island-bg': scheme.islandBg,
    '--scan-island-bg-dark': scheme.islandBgDark,
    '--scan-island-border': scheme.islandBorder,
    // Card full backgrounds (profile = most saturated, student = medium, ai = lightest)
    '--scan-profile-bg': scheme.profileBg,
    '--scan-profile-bg-dark': scheme.profileBgDark,
    '--scan-profile-border': scheme.profileBorder,
    '--scan-student-bg': scheme.studentBg,
    '--scan-student-bg-dark': scheme.studentBgDark,
    '--scan-ai-bg': scheme.aiBg,
    '--scan-ai-bg-dark': scheme.aiBgDark,
  };
}
