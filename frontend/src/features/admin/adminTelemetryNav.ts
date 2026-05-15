/** 与动物房页一致：侧栏/命令面板进入全屏前写入，刷新后仍可「返回」 */
export const ANIMAL_ROOM_TELEMETRY_RETURN_TO_KEY = "animalRoomTelemetryReturnTo";

/** 数字孪生大屏：独立 key，避免与动物房页互相覆盖 returnTo */
export const DIGITAL_TWIN_SCREEN_RETURN_TO_KEY = "digitalTwinScreenReturnTo";

/** 动物房驾驶舱全屏页：独立 returnTo key */
export const ANIMAL_ROOM_COCKPIT_RETURN_TO_KEY = "animalRoomCockpitReturnTo";

/**
 * 管理后台侧栏「分组文件夹」展开态（sessionStorage）。
 * 动物房/数字孪生等挂在 TwinLayout 下的全屏路由会卸载 AdminLayout；返回时需恢复展开位置。
 */
export const ADMIN_SIDEBAR_OPEN_GROUPS_SESSION_KEY = "aroAdminSidebarOpenGroupsV1";

export function readAdminSidebarOpenGroupsSession(): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(ADMIN_SIDEBAR_OPEN_GROUPS_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}
