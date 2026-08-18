/**
 * 学生端导航模型构建：读取 STUDENT 作用域的后台导航配置，回退到硬编码注册表，
 * 产出侧栏分组 + 扁平可导航项（供命令面板 / 快捷键检索）。
 */
import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  DoorOpen,
  Package,
  ShoppingCart,
  FileText,
  Bell,
  MessageSquare,
  Settings,
} from "lucide-react";
import { fetchAdminNavConfig, type AdminNavConfigNode } from "@/api/domains/adminNavConfig.api";
import { hasMinRole } from "@/features/auth/roleAccess";
import { canShowWebEntry } from "@/features/auth/pagePermissionAccess";
import {
  STUDENT_NAV_REGISTRY,
  type StudentNavContext,
  type StudentNavRegistryItem,
} from "./studentNavRegistry";

export type StudentSidebarNavItem = {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

export type StudentSidebarNavGroup = {
  id: string;
  title: string;
  items: StudentSidebarNavItem[];
};

/** 规范化路径：补前导斜杠 + 折叠重复斜杠（学生端无 /console 前缀）。 */
export function normalizeStudentPath(path: string): string {
  if (!path) return "";
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(/\/+/g, "/");
}

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutGrid,
  DoorOpen,
  Package,
  ShoppingCart,
  FileText,
  Bell,
  MessageSquare,
  Settings,
};

function resolveIconByName(name: string | null | undefined): LucideIcon {
  if (!name) return FileText;
  return ICON_MAP[name] ?? FileText;
}

function iconNameOf(icon: LucideIcon): string {
  return (icon as any)?.displayName || "Layers";
}

function buildRegistryByPath(): Map<string, StudentNavRegistryItem> {
  const map = new Map<string, StudentNavRegistryItem>();
  for (const g of STUDENT_NAV_REGISTRY) {
    for (const it of g.items) {
      map.set(normalizeStudentPath(it.path), it);
    }
  }
  return map;
}

/**
 * 纯函数：将 STUDENT 导航配置节点转换为侧栏分组模型。
 * 无 HTTP 依赖，便于单测。
 */
export function convertStudentConfigToModel(
  nodes: AdminNavConfigNode[],
  ctx: StudentNavContext,
): StudentSidebarNavGroup[] {
  const registryByPath = buildRegistryByPath();
  const sidebarGroups: StudentSidebarNavGroup[] = [];

  for (const node of nodes) {
    if (node.type !== "GROUP" || node.visible === false) continue;

    const items: StudentSidebarNavItem[] = [];
    for (const child of node.children ?? []) {
      if (child.type !== "ITEM" || child.visible === false) continue;
      if (!child.itemPath) continue;

      // 若注册表有对应条目，以注册表的 sidebarVisible 为准（防止 DB config 绕过）
      const regItem = registryByPath.get(normalizeStudentPath(child.itemPath));
      if (regItem && !regItem.sidebarVisible(ctx)) continue;

      if (!hasMinRole(ctx.role, "MEMBER")) continue;
      if (!canShowWebEntry(ctx.permNodes, child.itemPath, "sidebar", ctx.role, "MEMBER")) continue;

      items.push({
        key: child.id,
        to: child.itemPath,
        label: child.title,
        icon: resolveIconByName(child.itemIcon),
      });
    }

    if (items.length > 0) {
      sidebarGroups.push({ id: node.id, title: node.title, items });
    }
  }

  return sidebarGroups;
}

export async function buildStudentNavModel(ctx: StudentNavContext): Promise<{
  sidebarGroups: StudentSidebarNavGroup[];
  flatNavigableItems: Array<{ id: string; path: string; label: string; groupTitle: string }>;
}> {
  const nodes = await fetchAdminNavConfig("STUDENT");

  let sidebarGroups: StudentSidebarNavGroup[];

  if (nodes.length > 0) {
    sidebarGroups = convertStudentConfigToModel(nodes, ctx);
  } else {
    // 回退到硬编码注册表
    sidebarGroups = STUDENT_NAV_REGISTRY.map((g) => ({
      id: g.id,
      title: g.title,
      items: g.items.map((it) => ({ key: it.id, to: it.path, label: it.label, icon: it.icon })),
    }));

    // 后台自动播种：表为空时从注册表恢复，避免必须重启应用
    const registryItems = STUDENT_NAV_REGISTRY.flatMap((g) =>
      g.items.map((it) => ({
        path: it.path,
        label: it.label,
        icon: iconNameOf(it.icon),
        groupTitle: g.title,
      })),
    );
    if (registryItems.length > 0) {
      import("@/api/domains/adminNavConfig.api").then(({ ensureNavItems }) => {
        ensureNavItems(registryItems, "STUDENT").catch(() => {});
      });
    }
  }

  const flatNavigableItems = sidebarGroups.flatMap((g) =>
    g.items.map((it) => ({ id: it.key, path: it.to, label: it.label, groupTitle: g.title })),
  );

  return { sidebarGroups, flatNavigableItems };
}
