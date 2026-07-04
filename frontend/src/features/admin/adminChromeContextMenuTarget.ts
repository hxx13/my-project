import { isStaffNavPersonalizationPath, normalizeAdminPath } from "@/features/admin/buildAdminNavModel";

export type AdminNavContextMenuTarget = {
  path: string;
  label: string;
};

export type AdminSensitiveContextMenuTarget = {
  label: string;
  /** 可在此菜单中看到「敏感操作」说明与跳转的最低角色 */
  configureMinRole: string;
};

/** 好友列表行（与 StaffMessagesPage 上 data-admin-chrome-friend-row 同源） */
export type AdminFriendRowContextMenuTarget = {
  peerUserId: string;
  username: string;
  displayNickname: string;
  contactGroupId: string;
};

const STAFF_NAV_HREF_SEGMENT =
  "(?:admin[^?#]*|animal-room-telemetry|animal-room-cockpit|digital-twin-screen)";

function parseAdminPathFromHref(href: string): string | null {
  const trimmed = (href || "").trim();
  if (!trimmed) return null;
  const hashMatch = trimmed.match(new RegExp(`#(\\/(?:console\\/)?${STAFF_NAV_HREF_SEGMENT})`));
  if (hashMatch) return normalizeAdminPath(hashMatch[1]);
  const relMatch = trimmed.match(new RegExp(`^(\\/(?:console\\/)?${STAFF_NAV_HREF_SEGMENT})`));
  if (relMatch) return normalizeAdminPath(relMatch[1]);
  try {
    const pathname = new URL(trimmed, window.location.href).pathname;
    const p = normalizeAdminPath(pathname);
    if (isStaffNavPersonalizationPath(p)) return p;
  } catch {
    /* ignore */
  }
  return null;
}

/** 从侧栏 NavLink（data-admin-sidebar-nav）或页面内任意指向 #/admin 的链接解析路由，供「入口权限（快捷）」 */
export function parseAdminNavLinkFromEventTarget(target: EventTarget | null): AdminNavContextMenuTarget | null {
  if (!target || !(target instanceof Element)) return null;

  const navRoot = target.closest(
    "[data-admin-sidebar-nav], [data-admin-sidebar-nav-top], [data-admin-sidebar-nav-groups]"
  );
  const sidebarItem = target.closest("[data-admin-sidebar-nav-item]");

  if (sidebarItem && navRoot?.contains(sidebarItem)) {
    const path = normalizeAdminPath(sidebarItem.getAttribute("data-admin-nav-path") || "");
    if (!isStaffNavPersonalizationPath(path)) return null;
    const label =
      (sidebarItem.getAttribute("data-admin-nav-label") || "").trim() ||
      path;
    return { path, label };
  }

  const a = target.closest("a[href]");
  if (!a) return null;
  const path = parseAdminPathFromHref(a.getAttribute("href") || "");
  if (!path || !isStaffNavPersonalizationPath(path)) return null;
  const label =
    (a.getAttribute("data-admin-nav-label") || "").trim() ||
    (a.getAttribute("title") || "").trim() ||
    (a.textContent || "").replace(/\s+/g, " ").trim() ||
    path;
  if (navRoot && navRoot.contains(a)) {
    return { path, label };
  }
  return { path, label };
}

/** 高敏感控件：见 AdminSensitiveAction */
export function parseSensitiveFromEventTarget(target: EventTarget | null): AdminSensitiveContextMenuTarget | null {
  if (!target || !(target instanceof Element)) return null;
  const el = target.closest("[data-admin-sensitive-action]");
  if (!el) return null;
  const label = (el.getAttribute("data-sensitive-label") || "").trim() || "敏感操作";
  const configureMinRole = (el.getAttribute("data-sensitive-configure-min-role") || "SUPER_ADMIN").trim().toUpperCase();
  return { label, configureMinRole };
}

export function parseFriendRowFromEventTarget(target: EventTarget | null): AdminFriendRowContextMenuTarget | null {
  if (!target || !(target instanceof Element)) return null;
  const el = target.closest("[data-admin-chrome-friend-row]");
  if (!el) return null;
  const raw = el.getAttribute("data-friend");
  if (!raw) return null;
  try {
    const o = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.username !== "string") return null;
    return {
      peerUserId: o.id,
      username: o.username,
      displayNickname: typeof o.displayNickname === "string" ? o.displayNickname : "",
      contactGroupId: typeof o.contactGroupId === "string" ? o.contactGroupId : "",
    };
  } catch {
    return null;
  }
}
