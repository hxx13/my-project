/**
 * 首页 Dashboard 科幻流光主题 — 可调参数集中于此。
 * 开关状态以登录账号为准：持久化在 `/api/me/mini-preferences` 的 `twinWebChromeTheme`（见 `useTwinChromeTheme` / `useSciFiDashboardTheme`）。
 * 删除本目录并移除 DashboardPage 引用即可完全还原默认 UI。
 */

/** 历史仅设备本地键；已由账号偏好替代，读取成功后由 hook 清除 */
export const SCI_FI_DASHBOARD_STORAGE_KEY = "twin_dashboard_sci_fi_v1";

/** 未登录且无任何缓存时的默认（与后端 twinWebChromeTheme 缺省一致） */
export const SCI_FI_DEFAULT_ENABLED = false;

/** 供 DOM data-* 与 CSS 选择器使用 */
export const SCI_FI_DATA_ATTR = "data-scifi-dashboard";

export const sciFiDashboardCssVars = {
    /** 主背景叠层基色 */
    bgDeep: "rgba(2, 6, 23, 0.92)",
    bgMid: "rgba(15, 23, 42, 0.55)",
    /** 极光层 */
    auroraA: "rgba(56, 189, 248, 0.14)",
    auroraB: "rgba(168, 85, 247, 0.12)",
    auroraC: "rgba(34, 211, 238, 0.08)",
    /** 流光描边 */
    flowLine: "rgba(125, 211, 252, 0.45)",
    flowLineSoft: "rgba(99, 102, 241, 0.25)",
    /** 扫描线 */
    scanline: "rgba(148, 163, 184, 0.04)",
    /** 主文字（覆盖 slate-800 区域） */
    textPrimary: "rgb(226 232 240)",
    textMuted: "rgb(148 163 184)",
} as const;

export const sciFiDashboardMotion = {
    /** 极光旋转周期 */
    auroraRotateSec: 22,
    /** 外框流光扫过周期 */
    borderFlowSec: 6,
} as const;

export const sciFiDashboardFeatureFlags = {
    enableAurora: true,
    enableScanlines: true,
    enableOuterFlowRing: true,
    enableCornerBrackets: false,
} as const;
