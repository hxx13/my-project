/** 通告条带内单张弹窗的唯一标识 */
export type ScanNoticePanelKey =
  | "violation"
  | "unbound"
  | `announcement-${number}`
  | "announcement-manual";

export function announcementPanelKey(id: number): `announcement-${number}` {
  return `announcement-${id}`;
}

export function isAnnouncementPanelKey(key: ScanNoticePanelKey): key is `announcement-${number}` {
  return key.startsWith("announcement-") && key !== "announcement-manual";
}

export function parseAnnouncementPanelId(key: ScanNoticePanelKey): number | null {
  if (!isAnnouncementPanelKey(key)) return null;
  const n = Number(key.slice("announcement-".length));
  return Number.isFinite(n) ? n : null;
}

/** 同时展示两条及以上通告时显示「全部关闭」 */
export function shouldShowCloseAllButton(count: number): boolean {
  return count >= 2;
}
