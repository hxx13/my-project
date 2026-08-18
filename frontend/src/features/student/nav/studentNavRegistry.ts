/**
 * 学生端导航单一数据源：侧栏等入口均由此推导可见性与展示字段。
 * 侧栏可见性 = `canShowWebEntry`（与「页面权限设置」里 WEB + sidebar + ENTRY 的 enabled/minRole 一致）。
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
import type { MinRole, PublicPagePermissionNode } from "@/api/domains/pagePermission.api";
import { canShowWebEntry } from "@/features/auth/pagePermissionAccess";

export type StudentNavContext = { role: string; permNodes: PublicPagePermissionNode[] };

export type StudentNavRegistryItem = {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  fallbackMinRole: MinRole;
  sidebarVisible: (ctx: StudentNavContext) => boolean;
};

export type StudentNavRegistryGroup = { id: string; title: string; items: StudentNavRegistryItem[] };

function show(ctx: StudentNavContext, path: string, fallbackMinRole: MinRole) {
  return canShowWebEntry(ctx.permNodes, path, "sidebar", ctx.role, fallbackMinRole);
}

/** 扁平化分组内全部注册项 */
export function collectStudentRegistryItems(g: StudentNavRegistryGroup): StudentNavRegistryItem[] {
  return g.items;
}

/** 构造学生导航可见性上下文 */
export function createStudentNavContext(
  role: string,
  permNodes: PublicPagePermissionNode[]
): StudentNavContext {
  return { role, permNodes };
}

/** 有序注册表：顺序即侧栏分组顺序 */
export const STUDENT_NAV_REGISTRY: StudentNavRegistryGroup[] = [
  {
    id: "space",
    title: "空间",
    items: [
      {
        id: "cage-shelf",
        path: "/student/cage-shelf",
        label: "笼架信息",
        icon: LayoutGrid,
        fallbackMinRole: "MEMBER",
        sidebarVisible: (ctx) => show(ctx, "/student/cage-shelf", "MEMBER"),
      },
      {
        id: "rooms",
        path: "/student/rooms",
        label: "我的房间",
        icon: DoorOpen,
        fallbackMinRole: "MEMBER",
        sidebarVisible: (ctx) => show(ctx, "/student/rooms", "MEMBER"),
      },
    ],
  },
  {
    id: "material",
    title: "物品",
    items: [
      {
        id: "material",
        path: "/student/material",
        label: "申领物品",
        icon: Package,
        fallbackMinRole: "MEMBER",
        sidebarVisible: (ctx) => show(ctx, "/student/material", "MEMBER"),
      },
    ],
  },
  {
    id: "order",
    title: "订购",
    items: [
      {
        id: "animal-order",
        path: "/student/animal-order",
        label: "实验动物订购",
        icon: ShoppingCart,
        fallbackMinRole: "MEMBER",
        sidebarVisible: (ctx) => show(ctx, "/student/animal-order", "MEMBER"),
      },
    ],
  },
  {
    id: "aup",
    title: "计划书",
    items: [
      {
        id: "aup",
        path: "/student/aup",
        label: "AUP 计划书",
        icon: FileText,
        fallbackMinRole: "MEMBER",
        sidebarVisible: (ctx) => show(ctx, "/student/aup", "MEMBER"),
      },
    ],
  },
  {
    id: "message",
    title: "消息",
    items: [
      {
        id: "notifications",
        path: "/student/notifications",
        label: "通知",
        icon: Bell,
        fallbackMinRole: "MEMBER",
        sidebarVisible: (ctx) => show(ctx, "/student/notifications", "MEMBER"),
      },
      {
        id: "feedback",
        path: "/student/feedback",
        label: "帮助反馈",
        icon: MessageSquare,
        fallbackMinRole: "MEMBER",
        sidebarVisible: (ctx) => show(ctx, "/student/feedback", "MEMBER"),
      },
    ],
  },
  {
    id: "account",
    title: "账号",
    items: [
      {
        id: "settings",
        path: "/student/settings",
        label: "设置",
        icon: Settings,
        fallbackMinRole: "MEMBER",
        sidebarVisible: (ctx) => show(ctx, "/student/settings", "MEMBER"),
      },
    ],
  },
];
