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

// ═══ 遮罩：随色系变色，让组件立体凸起 ═══
/** 全屏遮罩：方案强调色渐变 + 强模糊。每个色系的遮罩都不同，组件在彩色底上自然凸起 */
export function schemeBackdrop(scheme: ScanColorScheme): string {
  return `bg-[linear-gradient(135deg,color-mix(in_srgb,${scheme.accent}_18%,#fff5f5),color-mix(in_srgb,${scheme.accent}_12%,#fffaf5),color-mix(in_srgb,${scheme.accentStrong}_15%,#fff7f0))] dark:bg-[linear-gradient(135deg,color-mix(in_srgb,${scheme.accent}_22%,#120e0c),color-mix(in_srgb,${scheme.accentStrong}_18%,#14100e),color-mix(in_srgb,${scheme.accent}_25%,#100e0d))] backdrop-blur-lg [contain:paint]`;
}
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

/** 周曲线图卡（预期核心在馆时间带）— 背景见 scanPopupNotice.css `.scan-weekly-chart-card` */
export const CHART_CARD = "scan-weekly-chart-card";

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
  /** 主强调色 400 级别（参考后台入口图标） */
  accent: string;
  /** 强强调色 500 级别 */
  accentStrong: string;
  accentGradient: string;
  glow: string;
  chartStrokeEntry: string;
  chartStrokeExit: string;
  chartFill: string;
  badgeBg: string;
  badgeBorder: string;
  expGradient: string;
  /** ProfileHeader 整卡底色 300 级别（最深/最饱和） */
  profileBg: string;
  profileBgDark: string;
  profileBorder: string;
  /** StudentEntryCard 整卡底色 200 级别（中等） */
  studentBg: string;
  studentBgDark: string;
  /** AIPredictionCard 整卡底色 100 级别（最浅） */
  aiBg: string;
  aiBgDark: string;
};

/** 10 套高饱和暖色方案。色值参考后台入口图标渐变（400→500 级别）。遮罩、卡片、图表全部跟色系变色。 */
export const SCAN_COLOR_SCHEMES: ScanColorScheme[] = [
  // ── 1. 琥珀金 ──
  {
    id: 1, name: "琥珀金",
    accent: "#fbbf24", accentStrong: "#f59e0b",
    accentGradient: "linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)",
    glow: "rgba(251,191,36,0.30)",
    chartStrokeEntry: "#fbbf24", chartStrokeExit: "#f59e0b", chartFill: "rgba(251,191,36,0.22)",
    badgeBg: "#1c1610", badgeBorder: "#fbbf24",
    expGradient: "linear-gradient(90deg, rgba(251,191,36,0.35), rgba(245,158,11,0.70))",
    profileBg: "#fef3c7", profileBgDark: "#1e180e", profileBorder: "#fbbf24",
    studentBg: "#fef9e7", studentBgDark: "#1c1910",
    aiBg: "#fffdf0", aiBgDark: "#1b1911",
  },
  // ── 2. 珊瑚橙 ──
  {
    id: 2, name: "珊瑚橙",
    accent: "#fb923c", accentStrong: "#f97316",
    accentGradient: "linear-gradient(135deg, #fb923c, #f97316, #ea580c)",
    glow: "rgba(251,146,60,0.28)",
    chartStrokeEntry: "#fb923c", chartStrokeExit: "#f97316", chartFill: "rgba(251,146,60,0.22)",
    badgeBg: "#1c1410", badgeBorder: "#fb923c",
    expGradient: "linear-gradient(90deg, rgba(251,146,60,0.35), rgba(249,115,22,0.70))",
    profileBg: "#ffedd5", profileBgDark: "#1e1810", profileBorder: "#fb923c",
    studentBg: "#fef2e0", studentBgDark: "#1c1812",
    aiBg: "#fff7ed", aiBgDark: "#1b1814",
  },
  // ── 3. 玫瑰粉 ──
  {
    id: 3, name: "玫瑰粉",
    accent: "#fb7185", accentStrong: "#f43f5e",
    accentGradient: "linear-gradient(135deg, #fb7185, #f43f5e, #e11d48)",
    glow: "rgba(251,113,133,0.28)",
    chartStrokeEntry: "#fb7185", chartStrokeExit: "#f43f5e", chartFill: "rgba(251,113,133,0.20)",
    badgeBg: "#1c1416", badgeBorder: "#fb7185",
    expGradient: "linear-gradient(90deg, rgba(251,113,133,0.35), rgba(244,63,94,0.70))",
    profileBg: "#ffe4e6", profileBgDark: "#1e1416", profileBorder: "#fb7185",
    studentBg: "#ffeef0", studentBgDark: "#1c1416",
    aiBg: "#fff5f6", aiBgDark: "#1b1416",
  },
  // ── 4. 紫罗兰 ──
  {
    id: 4, name: "紫罗兰",
    accent: "#a78bfa", accentStrong: "#8b5cf6",
    accentGradient: "linear-gradient(135deg, #c084fc, #a78bfa, #8b5cf6)",
    glow: "rgba(167,139,250,0.28)",
    chartStrokeEntry: "#a78bfa", chartStrokeExit: "#8b5cf6", chartFill: "rgba(167,139,250,0.20)",
    badgeBg: "#1a1620", badgeBorder: "#a78bfa",
    expGradient: "linear-gradient(90deg, rgba(167,139,250,0.35), rgba(139,92,246,0.70))",
    profileBg: "#ede9fe", profileBgDark: "#1c1820", profileBorder: "#a78bfa",
    studentBg: "#f3f0ff", studentBgDark: "#1b1820",
    aiBg: "#faf8ff", aiBgDark: "#1a1820",
  },
  // ── 5. 天青蓝 ──
  {
    id: 5, name: "天青蓝",
    accent: "#38bdf8", accentStrong: "#0ea5e9",
    accentGradient: "linear-gradient(135deg, #7dd3fc, #38bdf8, #0ea5e9)",
    glow: "rgba(56,189,248,0.28)",
    chartStrokeEntry: "#38bdf8", chartStrokeExit: "#0ea5e9", chartFill: "rgba(56,189,248,0.20)",
    badgeBg: "#101820", badgeBorder: "#38bdf8",
    expGradient: "linear-gradient(90deg, rgba(56,189,248,0.35), rgba(14,165,233,0.70))",
    profileBg: "#e0f2fe", profileBgDark: "#161e24", profileBorder: "#38bdf8",
    studentBg: "#ecf9ff", studentBgDark: "#151e24",
    aiBg: "#f5fcff", aiBgDark: "#141e24",
  },
  // ── 6. 祖母绿 ──
  {
    id: 6, name: "祖母绿",
    accent: "#34d399", accentStrong: "#10b981",
    accentGradient: "linear-gradient(135deg, #6ee7b7, #34d399, #10b981)",
    glow: "rgba(52,211,153,0.28)",
    chartStrokeEntry: "#34d399", chartStrokeExit: "#10b981", chartFill: "rgba(52,211,153,0.20)",
    badgeBg: "#101c16", badgeBorder: "#34d399",
    expGradient: "linear-gradient(90deg, rgba(52,211,153,0.35), rgba(16,185,129,0.70))",
    profileBg: "#d1fae5", profileBgDark: "#161e18", profileBorder: "#34d399",
    studentBg: "#e0fded", studentBgDark: "#151e18",
    aiBg: "#edfdf5", aiBgDark: "#141e18",
  },
  // ── 7. 桃红 ──
  {
    id: 7, name: "桃红",
    accent: "#f472b6", accentStrong: "#ec4899",
    accentGradient: "linear-gradient(135deg, #f9a8d4, #f472b6, #ec4899)",
    glow: "rgba(244,114,182,0.28)",
    chartStrokeEntry: "#f472b6", chartStrokeExit: "#ec4899", chartFill: "rgba(244,114,182,0.20)",
    badgeBg: "#1c141a", badgeBorder: "#f472b6",
    expGradient: "linear-gradient(90deg, rgba(244,114,182,0.35), rgba(236,72,153,0.70))",
    profileBg: "#fce7f3", profileBgDark: "#1e141a", profileBorder: "#f472b6",
    studentBg: "#fff0f7", studentBgDark: "#1c141a",
    aiBg: "#fff5fb", aiBgDark: "#1b1419",
  },
  // ── 8. 赤陶红 ──
  {
    id: 8, name: "赤陶红",
    accent: "#f87171", accentStrong: "#ef4444",
    accentGradient: "linear-gradient(135deg, #fca5a5, #f87171, #ef4444)",
    glow: "rgba(248,113,113,0.28)",
    chartStrokeEntry: "#f87171", chartStrokeExit: "#ef4444", chartFill: "rgba(248,113,113,0.20)",
    badgeBg: "#1c1010", badgeBorder: "#f87171",
    expGradient: "linear-gradient(90deg, rgba(248,113,113,0.35), rgba(239,68,68,0.70))",
    profileBg: "#fee2e2", profileBgDark: "#1e1414", profileBorder: "#f87171",
    studentBg: "#fef0f0", studentBgDark: "#1c1414",
    aiBg: "#fff7f7", aiBgDark: "#1b1414",
  },
  // ── 9. 靛蓝紫 ──
  {
    id: 9, name: "靛蓝紫",
    accent: "#818cf8", accentStrong: "#6366f1",
    accentGradient: "linear-gradient(135deg, #a5b4fc, #818cf8, #6366f1)",
    glow: "rgba(129,140,248,0.28)",
    chartStrokeEntry: "#818cf8", chartStrokeExit: "#6366f1", chartFill: "rgba(129,140,248,0.20)",
    badgeBg: "#141820", badgeBorder: "#818cf8",
    expGradient: "linear-gradient(90deg, rgba(129,140,248,0.35), rgba(99,102,241,0.70))",
    profileBg: "#e0e7ff", profileBgDark: "#181c26", profileBorder: "#818cf8",
    studentBg: "#eef0ff", studentBgDark: "#171c24",
    aiBg: "#f5f6ff", aiBgDark: "#161c24",
  },
  // ── 10. 暖桃橘 ──
  {
    id: 10, name: "暖桃橘",
    accent: "#FAD4C0", accentStrong: "#f8b8a0",
    accentGradient: "linear-gradient(135deg, #FAD4C0, #fbb9b6, #fb923c)",
    glow: "rgba(250,212,192,0.30)",
    chartStrokeEntry: "#FAD4C0", chartStrokeExit: "#fbb9b6", chartFill: "rgba(250,212,192,0.22)",
    badgeBg: "#1c1816", badgeBorder: "#FAD4C0",
    expGradient: "linear-gradient(90deg, rgba(250,212,192,0.35), rgba(251,185,182,0.70))",
    profileBg: "#fff0ed", profileBgDark: "#1e1816", profileBorder: "#FAD4C0",
    studentBg: "#fff5f3", studentBgDark: "#1c1816",
    aiBg: "#fffaf8", aiBgDark: "#1b1817",
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
    '--scan-glow': scheme.glow,
    '--scan-chart-entry': scheme.chartStrokeEntry,
    '--scan-chart-exit': scheme.chartStrokeExit,
    '--scan-chart-fill': scheme.chartFill,
    '--scan-badge-bg': scheme.badgeBg,
    '--scan-badge-border': scheme.badgeBorder,
    '--scan-exp-gradient': scheme.expGradient,
    // Card full backgrounds (profile = 300-level most saturated, student = 200, ai = 100 lightest)
    '--scan-profile-bg': scheme.profileBg,
    '--scan-profile-bg-dark': scheme.profileBgDark,
    '--scan-profile-border': scheme.profileBorder,
    '--scan-student-bg': scheme.studentBg,
    '--scan-student-bg-dark': scheme.studentBgDark,
    '--scan-ai-bg': scheme.aiBg,
    '--scan-ai-bg-dark': scheme.aiBgDark,
  };
}
