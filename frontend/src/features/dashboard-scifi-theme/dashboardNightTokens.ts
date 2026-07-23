/**
 * 首页暗色图表 / 逻辑用色：运行时读取 semantic --app-color-scan-*，与扫码弹窗同步换色。
 */

export type DashboardNightChartPalette = {
    entry: string;
    exit: string;
    accentInk: string;
    accentWarm: string;
    accentSteel: string;
    chartFill: string;
    textMuted: string;
    surfaceStudent: string;
    surfaceProfile: string;
};

const FALLBACK: DashboardNightChartPalette = {
    entry: "#E8A88C",
    exit: "#80A1C1",
    accentInk: "#FAD4C0",
    accentWarm: "#E8A88C",
    accentSteel: "#80A1C1",
    chartFill: "rgba(250,212,192,0.22)",
    textMuted: "rgba(250, 212, 192, 0.62)",
    surfaceStudent: "#1c1816",
    surfaceProfile: "#1e1816",
};

/** 将 #RGB / #RRGGBB 转为 rgba（供 ECharts 等无法用 CSS color-mix 的场景） */
export function hexToRgba(hex: string, alpha: number): string {
    const raw = hex.trim().replace("#", "");
    if (!raw) return `rgba(0,0,0,${alpha})`;
    const full =
        raw.length === 3
            ? raw
                  .split("")
                  .map((c) => c + c)
                  .join("")
            : raw.length >= 6
              ? raw.slice(0, 6)
              : raw.padEnd(6, "0");
    const n = Number.parseInt(full, 16);
    if (Number.isNaN(n)) return `rgba(0,0,0,${alpha})`;
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
}

function pickCssVar(el: Element, name: string, fallback: string): string {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
}

/** 从当前主题根读取扫码配色（优先 dashboard 根，否则 documentElement） */
export function readDashboardNightChartPalette(root?: Element | null): DashboardNightChartPalette {
    const el =
        root ??
        document.querySelector(".dashboard-home-root--night-sky") ??
        document.querySelector(".twin-chrome-debug-root--night-sky") ??
        document.querySelector(".admin-layout-root--night-sky") ??
        document.querySelector(".student-layout-root--night-sky") ??
        document.documentElement;
    return {
        entry: pickCssVar(el, "--app-color-scan-chart-stroke-entry", FALLBACK.entry),
        exit: pickCssVar(el, "--app-color-scan-chart-stroke-exit", FALLBACK.exit),
        accentInk: pickCssVar(el, "--app-color-scan-accent-ink", FALLBACK.accentInk),
        accentWarm: pickCssVar(el, "--app-color-scan-profile-accent", FALLBACK.accentWarm),
        accentSteel: pickCssVar(el, "--app-color-scan-ai-accent", FALLBACK.accentSteel),
        chartFill: pickCssVar(el, "--app-color-scan-chart-fill", FALLBACK.chartFill),
        textMuted: pickCssVar(el, "--dash-night-text-muted", FALLBACK.textMuted),
        surfaceStudent: pickCssVar(el, "--app-color-scan-student-bg", FALLBACK.surfaceStudent),
        surfaceProfile: pickCssVar(el, "--app-color-scan-profile-bg", FALLBACK.surfaceProfile),
    };
}

/** 暗色 UI 语义 class（定义于 dashboard-night-theme.css） */
export const DASH_NIGHT_CLASS = {
    title: "dash-night-title",
    textMuted: "dash-night-text-muted",
    header: "dash-night-header",
    iconBadge: "dash-night-icon-badge",
    iconBadgeSteel: "dash-night-icon-badge dash-night-icon-badge--steel",
    row: "dash-night-row",
    rowEnter: "dash-night-row dash-night-row--enter",
    rowExit: "dash-night-row dash-night-row--exit",
    rowWarn: "dash-night-row dash-night-row--warn",
    panel: "dash-night-panel",
    chip: "dash-night-chip",
    chipSteel: "dash-night-chip dash-night-chip--steel",
    chipMuted: "dash-night-chip dash-night-chip--muted",
    chipEnter: "dash-night-chip dash-night-chip--enter",
    chipExit: "dash-night-chip dash-night-chip--exit",
    chipSuccess: "dash-night-chip dash-night-chip--success",
    chipWarn: "dash-night-chip dash-night-chip--warn",
    chipDanger: "dash-night-chip dash-night-chip--danger",
    levelBadge: "dash-night-level-badge",
    badge: "dash-night-badge",
    badgeShared: "dash-night-badge dash-night-badge--shared",
    badgePublic: "dash-night-badge dash-night-badge--public",
    badgeOwn: "dash-night-badge dash-night-badge--own",
    badgeKeep: "dash-night-badge dash-night-badge--keep",
    metric: "dash-night-metric",
    metricWarn: "dash-night-metric dash-night-metric--warn",
    metricLabel: "dash-night-metric__label",
    metricValue: "dash-night-metric__value",
    btnNormal: "dash-night-btn dash-night-btn--normal",
    btnWarn: "dash-night-btn dash-night-btn--warn",
    btnDisabled: "dash-night-btn dash-night-btn--disabled",
    statusPulse: "dash-night-status-pulse",
    statusPulseDot: "dash-night-status-pulse__dot",
    timeCapsuleEnter: "dash-night-time-capsule dash-night-time-capsule--enter",
    timeCapsuleExit: "dash-night-time-capsule dash-night-time-capsule--exit",
    timeHourEnter: "dash-night-time-hour--enter",
    timeHourExit: "dash-night-time-hour--exit",
    hubEnter: "dash-night-hub--enter",
    hubExit: "dash-night-hub--exit",
    timelineRail: "dash-night-timeline-rail",
    chartArea: "dash-night-chart-area",
    tabGroup: "dash-night-tab-group",
    tab: "dash-night-tab",
    tabActive: "dash-night-tab dash-night-tab--active",
    tabBtn: "dash-night-tab-btn",
    tabBtnActive: "dash-night-tab-btn dash-night-tab-btn--active",
    timeCapsule: "dash-night-time-capsule",
    timeHour: "dash-night-time-capsule__hour",
    timeMin: "dash-night-time-capsule__min",
    chartShell: "dash-night-chart-shell",
    chartHeader: "dash-night-chart-header",
    legend: "dash-night-legend",
    legendWarm: "dash-night-legend__warm",
    legendSteel: "dash-night-legend__steel",
    listRow: "dash-night-list-row",
    progressTrack: "dash-night-progress-track",
    progressFill: "dash-night-progress-fill",
} as const;
