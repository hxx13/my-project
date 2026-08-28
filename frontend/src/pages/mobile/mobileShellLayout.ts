/** 手机版底栏 Tab 配置（与小程序 van-tabbar 视觉对齐） */

export const MOBILE_TAB_BAR_CONTENT_H = 50;
export const MOBILE_NAV_BAR_H = 44;

/** 底栏总高度（内容区 + 底部安全区） */
export const MOBILE_TAB_BAR_TOTAL_CSS = `calc(${MOBILE_TAB_BAR_CONTENT_H}px + env(safe-area-inset-bottom, 0px))`;

/** 全屏浮层让出底部 Tab 栏（面板底边距） */
export const MOBILE_OVERLAY_ABOVE_TAB_BOTTOM = MOBILE_TAB_BAR_TOTAL_CSS;

/** 滚动内容末尾额外留白（main 已预留 Tab 高度时叠加） */
export const MOBILE_SCROLL_END_EXTRA_PAD = "16px";

/** 顶栏总高度（含 safe-area） */
export const MOBILE_TOP_NAV_CSS = `calc(${MOBILE_NAV_BAR_H}px + env(safe-area-inset-top, 0px))`;

/** @deprecated 使用 flex 壳层后由父级分配高度 */
export const MOBILE_TAB_BAR_H = MOBILE_TAB_BAR_CONTENT_H;

export type MobileShellTabKey =
  | "home"
  | "rooms"
  | "material"
  | "records"
  | "violations"
  | "group"
  | "cage"
  | "mine"
  | "animalOrder";

export type MobileTabBarKey = "home" | "rooms" | "material" | "cage" | "mine";

export const MOBILE_TAB_BAR_KEYS: MobileTabBarKey[] = [
  "home",
  "rooms",
  "material",
  "cage",
  "mine",
];

export const MOBILE_TAB_TITLES: Record<MobileShellTabKey, string> = {
  home: "首页",
  rooms: "房间",
  material: "学生申领",
  cage: "笼架",
  records: "出入记录",
  violations: "违规记录",
  group: "课题组",
  mine: "我的",
  animalOrder: "动物订购",
};

export const MOBILE_SUBPAGE_TABS: MobileShellTabKey[] = ["records", "violations", "group", "animalOrder"];

export function isMobileTabBarKey(tab: MobileShellTabKey): tab is MobileTabBarKey {
  return MOBILE_TAB_BAR_KEYS.includes(tab as MobileTabBarKey);
}

export function resolveTabBarHighlight(active: MobileShellTabKey): MobileTabBarKey | null {
  if (isMobileTabBarKey(active)) return active;
  return null;
}

export const MOBILE_TAB_BAR_LABELS: Record<MobileTabBarKey, string> = {
  home: "首页",
  rooms: "房间",
  material: "申领",
  cage: "笼架",
  mine: "我的",
};
