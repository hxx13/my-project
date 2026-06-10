/**
 * 后台导航单一数据源：侧栏、工作台、命令面板均由此推导可见性与展示字段。
 * 侧栏可见性 = 角色能力位（flags）∧ `canShowWebEntry`（与「页面权限设置」里 WEB + sidebar + ENTRY 的 enabled/minRole 一致）。
 */
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowLeftRight,
  BarChart3,
  PieChart,
  Bell,
  BookOpen,
  CalendarClock,
  CircleCheck,
  ClipboardCheck,
  Clock,
  CreditCard,
  DoorOpen,
  Download,
  FileText,
  GitBranch,
  Images,
  KeyRound,
  LayoutGrid,
  Link2,
  LockKeyhole,
  MapPin,
  Megaphone,
  MessagesSquare,
  Monitor,
  Package,
  Server,
  Settings,
  ShieldAlert,
  ShoppingCart,
  SlidersHorizontal,
  Table2,
  TableProperties,
  Terminal,
  Thermometer,
  Ticket,
  Users,
  Wrench,
} from "lucide-react";
import type { MinRole, PublicPagePermissionNode } from "@/api/domains/pagePermission.api";
import type { PendingBadges } from "@/api/domains/me.api";
import { canShowWebEntry } from "@/features/auth/pagePermissionAccess";
import { hasMinRole } from "@/features/auth/roleAccess";
import { ANIMAL_ROOM_COCKPIT_RETURN_TO_KEY, DIGITAL_TWIN_SCREEN_RETURN_TO_KEY } from "@/features/admin/adminTelemetryNav";

export type PendingBadgeTextKey = keyof Pick<
  PendingBadges,
  | "notifyText"
  | "repairText"
  | "processRepairText"
  | "suppliesText"
  | "processSuppliesText"
  | "purchaseText"
  | "processPurchaseText"
>;

export type AdminNavContext = {
  role: string;
  permNodes: PublicPagePermissionNode[];
  flags: {
    canManagePersonnel: boolean;
    canRepairRequest: boolean;
    canRepairProcess: boolean;
    canPurchaseRequest: boolean;
    canPurchaseProcess: boolean;
    canViewNotifications: boolean;
    canViewSettings: boolean;
    canViewMetaStorage: boolean;
    canSuppliesMall: boolean;
    canSuppliesAdmin: boolean;
    canSuppliesProcess: boolean;
    canAssetOps: boolean;
  };
};

export type AdminNavRegistryItem = {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  homeTone: string;
  fallbackMinRole: MinRole;
  navEnd?: boolean;
  telemetry?: boolean;
  telemetryReturnStorageKey?: string;
  badgeTextKey?: PendingBadgeTextKey;
  sidebarVisible: (ctx: AdminNavContext) => boolean;
};

export type AdminNavRegistrySubgroup = {
  id: string;
  title: string;
  items: AdminNavRegistryItem[];
};

export type AdminNavRegistryGroup = {
  id: string;
  title: string;
  items?: AdminNavRegistryItem[];
  /** 侧栏二级文件夹（如资产与运维下的报修/采购/物资领用） */
  subgroups?: AdminNavRegistrySubgroup[];
};

function show(ctx: AdminNavContext, path: string, fallbackMinRole: MinRole) {
  return canShowWebEntry(ctx.permNodes, path, "sidebar", ctx.role, fallbackMinRole);
}

/** 扁平化分组内全部注册项（含二级文件夹） */
export function collectRegistryGroupItems(g: AdminNavRegistryGroup): AdminNavRegistryItem[] {
  return [...(g.items ?? []), ...(g.subgroups?.flatMap((sg) => sg.items) ?? [])];
}

/** 侧栏二级文件夹 session 展开键 */
export function adminNavSubgroupOpenKey(groupId: string, subgroupId: string): string {
  return `${groupId}__${subgroupId}`;
}

/** 有序注册表：顺序即侧栏/工作台分组顺序 */
export const ADMIN_NAV_REGISTRY: AdminNavRegistryGroup[] = [
  {
    id: "friends",
    title: "好友",
    items: [
      {
        id: "staff-messages",
        path: "/admin/staff-messages",
        label: "消息与通讯录",
        icon: MessagesSquare,
        homeTone: "from-violet-600 to-fuchsia-600",
        fallbackMinRole: "STAFF",
        sidebarVisible: () => false,
      },
    ],
  },
  {
    id: "org-notify",
    title: "组织与通知",
    items: [
      {
        id: "personnel",
        path: "/admin/personnel",
        label: "人员授权",
        icon: Users,
        homeTone: "from-indigo-600 to-blue-700",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canManagePersonnel && show(ctx, "/admin/personnel", "SUPER_ADMIN"),
      },
      {
        id: "notifications",
        path: "/admin/notifications",
        label: "消息通知",
        icon: Bell,
        homeTone: "from-violet-500 to-purple-500",
        fallbackMinRole: "STAFF",
        badgeTextKey: "notifyText",
        sidebarVisible: () => false,
      },
      {
        id: "student-warnings",
        path: "/admin/student-violations",
        label: "警告与弹窗公告",
        icon: AlertTriangle,
        homeTone: "from-amber-600 to-orange-700",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/student-violations", "ADMIN"),
      },
      {
        id: "content-hub",
        path: "/admin/content-hub",
        label: "小程序内容中心",
        icon: Megaphone,
        homeTone: "from-violet-600 to-indigo-600",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => show(ctx, "/admin/content-hub", "ADMIN"),
      },
    ],
  },
  {
    id: "system-security",
    title: "系统与安全",
    items: [
      {
        id: "schedule",
        path: "/admin/schedule-manager",
        label: "定时管理",
        icon: CalendarClock,
        homeTone: "from-slate-700 to-gray-600",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/schedule-manager", "ADMIN"),
      },
      {
        id: "settings",
        path: "/admin/settings",
        label: "系统设置",
        icon: Settings,
        homeTone: "from-slate-600 to-slate-500",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && show(ctx, "/admin/settings", "SUPER_ADMIN"),
      },
      {
        id: "logging-console",
        path: "/admin/logging-console",
        label: "日志控制台",
        icon: Terminal,
        homeTone: "from-emerald-700 to-teal-600",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && show(ctx, "/admin/logging-console", "SUPER_ADMIN"),
      },
      {
        id: "external-comm",
        path: "/admin/external-comm-config",
        label: "外部通信配置",
        icon: Link2,
        homeTone: "from-cyan-600 to-blue-600",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && show(ctx, "/admin/external-comm-config", "SUPER_ADMIN"),
      },
      {
        id: "api-docs",
        path: "/admin/api-docs",
        label: "接口中心",
        icon: BookOpen,
        homeTone: "from-emerald-600 to-teal-600",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && show(ctx, "/admin/api-docs", "SUPER_ADMIN"),
      },
      {
        id: "page-perms",
        path: "/admin/page-permissions",
        label: "页面权限设置",
        icon: KeyRound,
        homeTone: "from-rose-600 to-pink-600",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && show(ctx, "/admin/page-permissions", "SUPER_ADMIN"),
      },
      {
        id: "knowledge",
        path: "/admin/knowledge",
        label: "知识库",
        icon: BookOpen,
        homeTone: "from-indigo-600 to-violet-700",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx: any) => true,
      },
      {
        id: "smartsheet",
        path: "/admin/smartsheet",
        label: "智能表格",
        icon: Table2,
        homeTone: "from-indigo-600 to-violet-700",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx: any) => true,
      },
      {
        id: "login-branding",
        path: "/admin/login-branding",
        label: "登录页轮播图",
        icon: Images,
        homeTone: "from-sky-600 to-indigo-600",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && show(ctx, "/admin/login-branding", "ADMIN"),
      },
      {
        id: "registration-invites",
        path: "/admin/registration-invites",
        label: "注册推荐码",
        icon: Ticket,
        homeTone: "from-amber-600 to-orange-600",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && show(ctx, "/admin/registration-invites", "ADMIN"),
      },
    ],
  },
  {
    id: "access-meta-env",
    title: "门禁、元数据与环境",
    items: [
      {
        id: "dahua-issue",
        path: "/admin/dahua-issue",
        label: "大华发卡",
        icon: CreditCard,
        homeTone: "from-sky-600 to-indigo-600",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/dahua-issue", "ADMIN"),
      },
      {
        id: "door-control",
        path: "/admin/door-control",
        label: "门禁控制",
        icon: DoorOpen,
        homeTone: "from-emerald-600 to-green-700",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canManagePersonnel && show(ctx, "/admin/door-control", "SUPER_ADMIN"),
      },
      {
        id: "access-rules",
        path: "/admin/access-rules",
        label: "门禁规则配置",
        icon: LockKeyhole,
        homeTone: "from-red-500 to-rose-600",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/access-rules", "ADMIN"),
      },
      {
        id: "swing-tasks",
        path: "/admin/dahua-swing-tasks",
        label: "门禁数据工作台",
        icon: SlidersHorizontal,
        homeTone: "from-blue-600 to-indigo-700",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/dahua-swing-tasks", "ADMIN"),
      },
      {
        id: "swing-rules",
        path: "/admin/dahua-swing-rules",
        label: "门禁联动规则",
        icon: ShieldAlert,
        homeTone: "from-purple-600 to-indigo-700",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/dahua-swing-rules", "ADMIN"),
      },
      {
        id: "auto-logs",
        path: "/admin/automation-logs",
        label: "自动化日志",
        icon: FileText,
        homeTone: "from-violet-600 to-indigo-700",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canViewNotifications && show(ctx, "/admin/automation-logs", "STAFF"),
      },
      {
        id: "dept-storage",
        path: "/admin/department-storage",
        label: "部门落库",
        icon: GitBranch,
        homeTone: "from-amber-500 to-orange-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/department-storage", "ADMIN"),
      },
      {
        id: "telemetry-wl",
        path: "/admin/telemetry-watchlists",
        label: "WinCC 变量导入",
        icon: Table2,
        homeTone: "from-cyan-500 to-blue-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/telemetry-watchlists", "ADMIN"),
      },
      {
        id: "telemetry-arch",
        path: "/admin/telemetry-archive",
        label: "温湿度数据归档",
        icon: Archive,
        homeTone: "from-teal-600 to-cyan-700",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/telemetry-archive", "ADMIN"),
      },
      {
        id: "animal-tel",
        path: "/animal-room-telemetry",
        label: "动物房温湿度监测",
        icon: Thermometer,
        homeTone: "from-sky-500 to-indigo-600",
        fallbackMinRole: "ADMIN",
        telemetry: true,
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/animal-room-telemetry", "ADMIN"),
      },
      {
        id: "animal-cockpit",
        path: "/animal-room-cockpit",
        label: "动物房驾驶舱",
        icon: BarChart3,
        homeTone: "from-cyan-600 to-indigo-700",
        fallbackMinRole: "ADMIN",
        telemetry: true,
        telemetryReturnStorageKey: ANIMAL_ROOM_COCKPIT_RETURN_TO_KEY,
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/animal-room-cockpit", "ADMIN"),
      },
      {
        id: "digital-twin-screen",
        path: "/digital-twin-screen",
        label: "数字孪生大屏",
        icon: Monitor,
        homeTone: "from-cyan-600 to-indigo-700",
        fallbackMinRole: "ADMIN",
        telemetry: true,
        telemetryReturnStorageKey: DIGITAL_TWIN_SCREEN_RETURN_TO_KEY,
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/digital-twin-screen", "ADMIN"),
      },
    ],
  },
  {
    id: "aro-room-link",
    title: "ARO 房间与联动",
    items: [
      {
        id: "door-group",
        path: "/admin/door-group-storage",
        label: "门组落库",
        icon: Server,
        homeTone: "from-emerald-500 to-green-600",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/door-group-storage", "ADMIN"),
      },
      {
        id: "device-ch",
        path: "/admin/device-channels",
        label: "通道编码",
        icon: BarChart3,
        homeTone: "from-cyan-500 to-blue-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/device-channels", "ADMIN"),
      },
      {
        id: "aro-rooms",
        path: "/admin/aro-rooms",
        label: "ARO房间",
        icon: MapPin,
        homeTone: "from-fuchsia-500 to-violet-600",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/aro-rooms", "ADMIN"),
      },
      {
        id: "cage",
        path: "/admin/cage-shelves",
        label: "笼架信息",
        icon: LayoutGrid,
        homeTone: "from-cyan-500 to-blue-600",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canAssetOps && show(ctx, "/admin/cage-shelves", "STAFF"),
      },
      {
        id: "cage-index",
        path: "/admin/cage-shelf-indexes",
        label: "笼架落库索引",
        icon: TableProperties,
        homeTone: "from-slate-500 to-gray-600",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canAssetOps && show(ctx, "/admin/cage-shelf-indexes", "STAFF"),
      },
      {
        id: "cage-event-log",
        path: "/admin/cage-shelves/event-log",
        label: "笼位事件日志",
        icon: Clock,
        homeTone: "from-teal-500 to-cyan-600",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canAssetOps && show(ctx, "/admin/cage-shelves/event-log", "STAFF"),
      },
    ],
  },
  {
    id: "asset-ops",
    title: "资产与运维",
    items: [
      {
        id: "facility",
        path: "/admin/facility-maintenance",
        label: "检查维护",
        icon: Activity,
        homeTone: "from-emerald-600 to-teal-600",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canAssetOps && show(ctx, "/admin/facility-maintenance", "STAFF"),
      },
      {
        id: "asset-rec",
        path: "/admin/asset-records",
        label: "资产记录",
        icon: Archive,
        homeTone: "from-gray-600 to-slate-700",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canAssetOps && show(ctx, "/admin/asset-records", "STAFF"),
      },
      {
        id: "asset-xfer",
        path: "/admin/asset-transfer-records",
        label: "转移记录",
        icon: ArrowLeftRight,
        homeTone: "from-zinc-600 to-neutral-700",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canAssetOps && show(ctx, "/admin/asset-transfer-records", "STAFF"),
      },
      {
        id: "file-templates",
        path: "/admin/file-templates",
        label: "文件模板库",
        icon: Download,
        homeTone: "from-blue-600 to-indigo-600",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => show(ctx, "/admin/file-templates", "STAFF"),
      },
      {
        id: "analytics",
        path: "/admin/analytics",
        label: "统计与审计",
        icon: PieChart,
        homeTone: "from-violet-600 to-indigo-700",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => show(ctx, "/admin/analytics", "STAFF"),
      },
    ],
  },
  {
    id: "repair-supplies",
    title: "报修与物资领用",
    subgroups: [
      {
        id: "repair",
        title: "报修管理",
        items: [
          {
            id: "repair-req",
            path: "/admin/repair-request",
            label: "报修申请",
            icon: Wrench,
            homeTone: "from-orange-500 to-amber-500",
            fallbackMinRole: "STAFF",
            badgeTextKey: "repairText",
            sidebarVisible: (ctx) => ctx.flags.canRepairRequest && show(ctx, "/admin/repair-request", "STAFF"),
          },
          {
            id: "repair-proc",
            path: "/admin/repair-process",
            label: "报修处理",
            icon: ClipboardCheck,
            homeTone: "from-amber-600 to-orange-600",
            fallbackMinRole: "SUPER_ADMIN",
            badgeTextKey: "processRepairText",
            sidebarVisible: (ctx) => ctx.flags.canRepairProcess && show(ctx, "/admin/repair-process", "SUPER_ADMIN"),
          },
        ],
      },
      {
        id: "purchase",
        title: "采购管理",
        items: [
          {
            id: "purchase-req",
            path: "/admin/purchase-request",
            label: "采购申请",
            icon: ShoppingCart,
            homeTone: "from-green-600 to-emerald-600",
            fallbackMinRole: "STAFF",
            badgeTextKey: "purchaseText",
            sidebarVisible: (ctx) => ctx.flags.canPurchaseRequest && show(ctx, "/admin/purchase-request", "STAFF"),
          },
          {
            id: "purchase-proc",
            path: "/admin/purchase-process",
            label: "采购处理",
            icon: CircleCheck,
            homeTone: "from-lime-600 to-green-600",
            fallbackMinRole: "SUPER_ADMIN",
            badgeTextKey: "processPurchaseText",
            sidebarVisible: (ctx) => ctx.flags.canPurchaseProcess && show(ctx, "/admin/purchase-process", "SUPER_ADMIN"),
          },
        ],
      },
      {
        id: "supplies",
        title: "物资领用",
        items: [
          {
            id: "supplies-mall",
            path: "/admin/supplies",
            label: "领用物资",
            icon: Package,
            homeTone: "from-sky-500 to-blue-600",
            fallbackMinRole: "ADMIN",
            navEnd: true,
            badgeTextKey: "suppliesText",
            sidebarVisible: (ctx) => ctx.flags.canSuppliesMall && show(ctx, "/admin/supplies", "ADMIN"),
          },
          {
            id: "supplies-audit-export",
            path: "/admin/supplies/audit-export",
            label: "领用导出",
            icon: Table2,
            homeTone: "from-teal-500 to-cyan-600",
            fallbackMinRole: "STAFF",
            sidebarVisible: (ctx) =>
              (ctx.flags.canSuppliesMall || ctx.flags.canSuppliesProcess || ctx.flags.canSuppliesAdmin) &&
              show(ctx, "/admin/supplies/audit-export", "STAFF"),
          },
        ],
      },
    ],
  },
  {
    id: "material-review",
    title: "审核",
    items: [
      {
        id: "material-review-pending",
        path: "/admin/material/review",
        label: "申领审核",
        icon: ClipboardCheck,
        homeTone: "from-blue-600 to-indigo-700",
        fallbackMinRole: "STAFF",
        sidebarVisible: () => true,
      },
      {
        id: "material-manage",
        path: "/admin/material/manage",
        label: "物品管理",
        icon: Package,
        homeTone: "from-emerald-600 to-green-700",
        fallbackMinRole: "STAFF",
        sidebarVisible: () => true,
      },
    ],
  },
];

const PATH_TITLE_MAP: Record<string, string> = Object.fromEntries(
  ADMIN_NAV_REGISTRY.flatMap((g) => collectRegistryGroupItems(g).map((it) => [it.path.replace(/\/+/g, "/"), it.label]))
);

PATH_TITLE_MAP["/admin/dahua-swing-tasks"] = "门禁数据工作台";
PATH_TITLE_MAP["/admin/access-fusion"] = "门禁数据工作台";
PATH_TITLE_MAP["/admin/access-clean-rule-profiles"] = "清洗规则方案";

function normalizePath(path: string): string {
  if (!path) return "";
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(/\/+/g, "/");
}

/** 后端仅下发、注册表未声明的 sidebar ENTRY 归入哪一区 */
export function inferHomeSectionTitleForUnknownPath(path: string): string {
  const p = normalizePath(path);
  if (
    p === "/admin/door-group-storage" ||
    p === "/admin/device-channels" ||
    p === "/admin/aro-rooms" ||
    p === "/admin/cage-shelves" ||
    p === "/admin/cage-shelves/event-log"
  ) {
    return "ARO 房间与联动";
  }
  if (
    p === "/admin/dahua-issue" ||
    p === "/admin/door-control" ||
    p.startsWith("/admin/access-rules") ||
    p.startsWith("/admin/schedule-manager") ||
    p.startsWith("/admin/dahua-swing-") ||
    p === "/admin/dahua-swing-stats-tasks" ||
    p === "/admin/access-audit-source" ||
    p === "/admin/access-fusion" ||
    p === "/admin/access-clean-rule-profiles" ||
    p === "/admin/automation-logs" ||
    p.startsWith("/admin/department-storage") ||
    p.startsWith("/admin/telemetry-") ||
    p === "/animal-room-telemetry" ||
    p === "/animal-room-cockpit" ||
    p === "/digital-twin-screen"
  ) {
    return "门禁、元数据与环境";
  }
  if (p.startsWith("/admin/repair-") || p.startsWith("/admin/purchase-") || p.startsWith("/admin/supplies")) {
    return "报修与物资领用";
  }
  if (
    p.startsWith("/admin/asset-") ||
    p === "/admin/file-templates" ||
    p === "/admin/analytics" ||
    p === "/admin/facility-maintenance"
  ) {
    return "资产与运维";
  }
  if (
    p === "/admin/notifications" ||
    p === "/admin/personnel" ||
    p === "/admin/staff-messages" ||
    p === "/admin/student-violations" ||
    p === "/admin/content-hub"
  ) {
    return "组织与通知";
  }
  if (
    p === "/admin/settings" ||
    p === "/admin/external-comm-config" ||
    p === "/admin/api-docs" ||
    p === "/admin/page-permissions" ||
    p === "/admin/login-branding" ||
    p === "/admin/registration-invites"
  ) {
    return "系统与安全";
  }
  return "自动发现";
}

export function titleForUnknownAdminPath(path: string): string {
  const norm = normalizePath(path);
  if (PATH_TITLE_MAP[norm]) return PATH_TITLE_MAP[norm];
  return (path.split("/").filter(Boolean).pop() || "新入口").replace(/-/g, " ");
}
