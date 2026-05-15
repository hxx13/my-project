import type { LucideIcon } from "lucide-react";
import { Layers, MessagesSquare } from "lucide-react";
import type { PendingBadges } from "@/api/domains/me.api";
import type { MinRole, PublicPagePermissionNode } from "@/api/domains/pagePermission.api";
import { hasMinRole } from "@/features/auth/roleAccess";
import { canShowWebEntry } from "@/features/auth/pagePermissionAccess";
import {
  ADMIN_NAV_REGISTRY,
  inferHomeSectionTitleForUnknownPath,
  titleForUnknownAdminPath,
  type AdminNavContext,
} from "@/features/admin/adminNavRegistry";

export type AdminSidebarNavItem = {
  key: string;
  to: string;
  end?: boolean;
  label: string;
  icon: LucideIcon;
  badgeText?: string;
  telemetry?: boolean;
  telemetryReturnStorageKey?: string;
  /** 侧栏图标外圈：背景 + 文字色 + ring，便于区分入口 */
  iconWrapClass?: string;
};

export type AdminSidebarNavGroup = {
  id: string;
  title: string;
  items: AdminSidebarNavItem[];
};

export type AdminHomeEntry = {
  title: string;
  path: string;
  minRole: MinRole;
  icon: LucideIcon;
  tone: string;
  enabled: boolean;
};

export type AdminHomeSection = {
  title: string;
  entries: AdminHomeEntry[];
};

export type AdminCommandPaletteItem = {
  id: string;
  path: string;
  label: string;
  groupTitle: string;
  telemetry?: boolean;
  telemetryReturnStorageKey?: string;
};

export function normalizeAdminPath(path: string): string {
  if (!path) return "";
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(/\/+/g, "/");
}

export function createAdminNavContext(role: string, permNodes: PublicPagePermissionNode[]): AdminNavContext {
  return {
    role,
    permNodes,
    flags: {
      canManagePersonnel: hasMinRole(role, "SUPER_ADMIN"),
      canRepairRequest: hasMinRole(role, "STAFF"),
      canRepairProcess: hasMinRole(role, "SUPER_ADMIN"),
      canPurchaseRequest: hasMinRole(role, "STAFF"),
      canPurchaseProcess: hasMinRole(role, "SUPER_ADMIN"),
      canViewNotifications: hasMinRole(role, "STAFF"),
      canViewSettings: hasMinRole(role, "SUPER_ADMIN"),
      canViewMetaStorage: hasMinRole(role, "ADMIN"),
      canSuppliesMall: hasMinRole(role, "ADMIN"),
      canSuppliesAdmin: hasMinRole(role, "SUPER_ADMIN"),
      canSuppliesProcess: hasMinRole(role, "SUPER_ADMIN"),
      canAssetOps: hasMinRole(role, "STAFF"),
    },
  };
}

export function resolveEntryMinRole(nodes: PublicPagePermissionNode[], path: string, fallback: MinRole): MinRole {
  const matched = nodes.find(
    (n) =>
      n.platform === "WEB" &&
      n.nodeType === "ENTRY" &&
      (n.entrySource || "other") === "sidebar" &&
      normalizeAdminPath(n.pathOrRoute) === normalizeAdminPath(path)
  );
  return (matched?.minRole as MinRole) || fallback;
}

function badgeTextFromKey(pending: PendingBadges | null, key?: keyof PendingBadges): string | undefined {
  if (!pending || !key) return undefined;
  const v = pending[key];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
}

const SIDEBAR_ICON_WRAP_PALETTE = [
  "bg-sky-500/25 text-sky-100 ring-sky-400/35",
  "bg-violet-500/25 text-violet-100 ring-violet-400/35",
  "bg-emerald-500/25 text-emerald-100 ring-emerald-400/35",
  "bg-amber-500/25 text-amber-100 ring-amber-400/35",
  "bg-rose-500/25 text-rose-100 ring-rose-400/35",
  "bg-cyan-500/25 text-cyan-100 ring-cyan-400/35",
  "bg-fuchsia-500/25 text-fuchsia-100 ring-fuchsia-400/35",
  "bg-orange-500/25 text-orange-100 ring-orange-400/35",
  "bg-teal-500/25 text-teal-100 ring-teal-400/35",
  "bg-indigo-500/25 text-indigo-100 ring-indigo-400/35",
  "bg-lime-500/20 text-lime-100 ring-lime-400/30",
  "bg-blue-500/25 text-blue-100 ring-blue-400/35",
] as const;

export function sidebarIconWrapForNavId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return SIDEBAR_ICON_WRAP_PALETTE[Math.abs(h) % SIDEBAR_ICON_WRAP_PALETTE.length];
}

/** 侧栏置顶「好友」入口（与注册表中 staff-messages 路径一致，供 prepend 与最近/收藏解析） */
export function buildFriendsNavSidebarItem(): AdminSidebarNavItem {
  return {
    key: "staff-messages",
    to: "/admin/staff-messages",
    label: "消息",
    icon: MessagesSquare,
    iconWrapClass: sidebarIconWrapForNavId("staff-messages"),
  };
}

export function buildAdminNavModel(ctx: AdminNavContext, pendingBadges: PendingBadges | null) {
  const sidebarGroups: AdminSidebarNavGroup[] = [];
  for (const g of ADMIN_NAV_REGISTRY) {
    const items: AdminSidebarNavItem[] = [];
    for (const it of g.items) {
      if (!it.sidebarVisible(ctx)) continue;
      items.push({
        key: it.id,
        to: it.path,
        end: it.navEnd,
        label: it.label,
        icon: it.icon,
        telemetry: it.telemetry,
        telemetryReturnStorageKey: it.telemetryReturnStorageKey,
        badgeText: badgeTextFromKey(pendingBadges, it.badgeTextKey),
        iconWrapClass: sidebarIconWrapForNavId(it.id),
      });
    }
    if (items.length) sidebarGroups.push({ id: g.id, title: g.title, items });
  }

  const knownPaths = new Set(
    ADMIN_NAV_REGISTRY.flatMap((g) => g.items.map((it) => normalizeAdminPath(it.path)))
  );

  const homeSections: AdminHomeSection[] = ADMIN_NAV_REGISTRY.map((g) => ({
    title: g.title,
    entries: g.items.map((it) => {
      const effectiveMinRole = resolveEntryMinRole(ctx.permNodes, it.path, it.fallbackMinRole);
      const roleOk = hasMinRole(ctx.role, effectiveMinRole);
      const permOk = canShowWebEntry(ctx.permNodes, it.path, "sidebar", ctx.role, effectiveMinRole);
      return {
        title: it.label,
        path: it.path,
        minRole: effectiveMinRole,
        icon: it.icon,
        tone: it.homeTone,
        enabled: roleOk && permOk,
      };
    }),
  }));

  const seenAutoPath = new Set<string>();
  const autoEntries: Array<AdminHomeEntry & { groupTitle: string }> = [];
  for (const n of ctx.permNodes) {
    if (!n || n.platform !== "WEB" || n.nodeType !== "ENTRY" || n.entrySource !== "sidebar") continue;
    const p = normalizeAdminPath(n.pathOrRoute);
    if (!p || knownPaths.has(p) || seenAutoPath.has(p)) continue;
    seenAutoPath.add(p);
    const minRole = (n.minRole as MinRole) || "STUDENT";
    const roleOk = hasMinRole(ctx.role, minRole);
    const permOk = canShowWebEntry(ctx.permNodes, n.pathOrRoute, "sidebar", ctx.role, minRole);
    autoEntries.push({
      title: titleForUnknownAdminPath(n.pathOrRoute),
      path: n.pathOrRoute,
      minRole,
      icon: Layers,
      tone: "from-cyan-500 to-blue-600",
      enabled: roleOk && permOk,
      groupTitle: inferHomeSectionTitleForUnknownPath(p),
    });
  }

  let mergedHome = homeSections.map((s) => ({ ...s, entries: [...s.entries] }));
  const unknown: AdminHomeEntry[] = [];
  for (const entry of autoEntries) {
    if (entry.groupTitle === "自动发现") {
      unknown.push(entry);
      continue;
    }
    const target = mergedHome.find((s) => s.title === entry.groupTitle);
    if (target) {
      const { groupTitle: _g, ...rest } = entry;
      target.entries.push(rest);
    } else {
      unknown.push(entry);
    }
  }
  if (unknown.length > 0) {
    mergedHome = [...mergedHome, { title: "自动发现", entries: unknown }];
  }

  const flatNavigableItems: AdminCommandPaletteItem[] = sidebarGroups.flatMap((g) =>
    g.items.map((it) => ({
      id: it.key,
      path: it.to,
      label: it.label,
      groupTitle: g.title,
      telemetry: it.telemetry,
      telemetryReturnStorageKey: it.telemetryReturnStorageKey,
    }))
  );

  return {
    sidebarGroups,
    homeSections: mergedHome,
    flatNavigableItems,
  };
}
