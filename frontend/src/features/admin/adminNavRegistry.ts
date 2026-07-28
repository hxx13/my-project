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
  CircleCheck,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  DoorOpen,
  Download,
  FileText,
  GitBranch,
  KeyRound,
  LayoutGrid,
  LineChart,
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
  TrendingUp,
  Thermometer,
  Ticket,
  ScanFace,
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
  | "processMaterialText"
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
  /** 搜索关键词：中文别名 + 英文关键词 + 缩写 */
  alias?: string[];
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
        homeTone: "from-violet-400 to-fuchsia-500",
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
        alias: ["人员", "用户", "授权", "权限", "personnel", "user", "staff", "role"],
        homeTone: "from-indigo-400 to-blue-500",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canManagePersonnel && show(ctx, "/admin/personnel", "SUPER_ADMIN"),
      },
      {
        id: "notifications",
        path: "/admin/notifications",
        label: "消息通知",
        icon: Bell,
        homeTone: "from-violet-400 to-purple-500",
        fallbackMinRole: "STAFF",
        badgeTextKey: "notifyText",
        sidebarVisible: () => false,
      },
      {
        id: "student-warnings",
        path: "/admin/student-violations",
        label: "警告与弹窗公告",
        icon: AlertTriangle,
        homeTone: "from-amber-400 to-orange-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/student-violations", "ADMIN"),
      },
      {
        id: "content-hub",
        path: "/admin/content-hub",
        label: "小程序内容中心",
        icon: Megaphone,
        homeTone: "from-violet-400 to-indigo-500",
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
        id: "settings",
        path: "/admin/settings",
        label: "系统设置",
        icon: Settings,
        alias: ["设置", "配置", "系统", "定时任务", "权限", "人脸", "通知", "集成", "品牌", "轮播图", "外部通信", "页面权限", "settings", "config"],
        homeTone: "from-slate-400 to-zinc-500",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && show(ctx, "/admin/settings", "SUPER_ADMIN"),
      },
      {
        id: "logging-console",
        path: "/admin/logging-console",
        label: "日志控制台",
        icon: Terminal,
        homeTone: "from-emerald-400 to-green-500",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && hasMinRole(ctx.role, "SUPER_ADMIN") && show(ctx, "/admin/logging-console", "SUPER_ADMIN"),
      },
      {
        id: "monitor",
        path: "/admin/monitor",
        label: "系统监控",
        icon: Monitor,
        homeTone: "from-teal-400 to-cyan-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && hasMinRole(ctx.role, "ADMIN") && show(ctx, "/admin/monitor", "ADMIN"),
      },
      {
        id: "api-docs",
        path: "/admin/api-docs",
        label: "接口中心",
        icon: BookOpen,
        homeTone: "from-green-400 to-emerald-500",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && hasMinRole(ctx.role, "SUPER_ADMIN") && show(ctx, "/admin/api-docs", "SUPER_ADMIN"),
      },
      {
        id: "nav-manager",
        path: "/admin/nav-manager",
        label: "侧栏导航管理",
        icon: LayoutGrid,
        homeTone: "from-sky-400 to-blue-500",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: () => false,
      },
      {
        id: "profile-security",
        path: "/admin/profile-security",
        label: "账号与安全",
        icon: ShieldAlert,
        homeTone: "from-slate-400 to-zinc-500",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => show(ctx, "/admin/profile-security", "STAFF"),
      },
      {
        id: "knowledge",
        path: "/admin/knowledge",
        label: "知识库",
        icon: BookOpen,
        alias: ["docs", "文档", "开发手册", "参考资料", "数字花园", "知识", "knowledge"],
        homeTone: "from-indigo-400 to-violet-500",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx: any) => ctx.flags.canViewSettings && show(ctx, "/admin/knowledge", "STAFF"),
      },
      {
        id: "registration-invites",
        path: "/admin/registration-invites",
        label: "注册推荐码",
        icon: Ticket,
        homeTone: "from-amber-400 to-orange-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && show(ctx, "/admin/registration-invites", "ADMIN"),
      },
      {
        id: "push-dashboard",
        path: "/admin/push-dashboard",
        label: "推送仪表盘",
        icon: BarChart3,
        homeTone: "from-blue-400 to-cyan-500",
        fallbackMinRole: "SUPER_ADMIN",
        alias: ["推送", "通知", "push", "dashboard", "仪表盘"],
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && show(ctx, "/admin/push-dashboard", "SUPER_ADMIN"),
      },
      {
        id: "push-config",
        path: "/admin/push-config",
        label: "推送配置",
        icon: Settings,
        homeTone: "from-violet-400 to-purple-500",
        fallbackMinRole: "SUPER_ADMIN",
        alias: ["推送配置", "通知源", "push", "config", "channel"],
        sidebarVisible: (ctx) => ctx.flags.canViewSettings && show(ctx, "/admin/push-config", "SUPER_ADMIN"),
      },
      {
        id: "notification-digest",
        path: "/admin/notification-digest",
        label: "通知聚合",
        icon: Clock,
        homeTone: "from-teal-400 to-emerald-500",
        fallbackMinRole: "STAFF",
        alias: ["聚合", "摘要", "digest", "通知频率", "免打扰"],
        sidebarVisible: (ctx) => show(ctx, "/admin/notification-digest", "STAFF"),
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
        homeTone: "from-fuchsia-400 to-pink-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/dahua-issue", "ADMIN"),
      },
      {
        id: "face-debug",
        path: "/admin/face-debug",
        label: "人脸识别调试",
        icon: ScanFace,
        homeTone: "from-sky-400 to-blue-500",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => show(ctx, "/admin/face-debug", "SUPER_ADMIN"),
      },
      {
        id: "door-control",
        path: "/admin/door-control",
        label: "门禁控制",
        icon: DoorOpen,
        alias: ["门禁", "门", "door", "access", "开门", "关门"],
        homeTone: "from-emerald-400 to-green-500",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canManagePersonnel && show(ctx, "/admin/door-control", "SUPER_ADMIN"),
      },
      {
        id: "access-rules",
        path: "/admin/access-rules",
        label: "门禁规则配置",
        icon: LockKeyhole,
        homeTone: "from-red-400 to-rose-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/access-rules", "ADMIN"),
      },
      {
        id: "swing-tasks",
        path: "/admin/dahua-swing-tasks",
        label: "门禁数据工作台",
        icon: SlidersHorizontal,
        homeTone: "from-violet-400 to-purple-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/dahua-swing-tasks", "ADMIN"),
      },
      {
        id: "swing-rules",
        path: "/admin/dahua-swing-rules",
        label: "门禁联动规则",
        icon: ShieldAlert,
        homeTone: "from-purple-400 to-indigo-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/dahua-swing-rules", "ADMIN"),
      },
      {
        id: "auto-logs",
        path: "/admin/automation-logs",
        label: "自动化日志",
        icon: FileText,
        homeTone: "from-violet-400 to-indigo-500",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canViewNotifications && show(ctx, "/admin/automation-logs", "STAFF"),
      },
      {
        id: "exp-stats",
        path: "/admin/exp-stats",
        label: "经验值统计",
        icon: TrendingUp,
        homeTone: "from-amber-400 to-yellow-500",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canViewNotifications && show(ctx, "/admin/exp-stats", "STAFF"),
      },
      {
        id: "dept-storage",
        path: "/admin/department-storage",
        label: "部门落库",
        icon: GitBranch,
        homeTone: "from-amber-400 to-orange-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/department-storage", "ADMIN"),
      },
      {
        id: "telemetry-wl",
        path: "/admin/telemetry-watchlists",
        label: "WinCC 变量导入",
        icon: Table2,
        homeTone: "from-purple-400 to-indigo-500",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/telemetry-watchlists", "SUPER_ADMIN"),
      },
      {
        id: "telemetry-arch",
        path: "/admin/telemetry-archive",
        label: "温湿度数据归档",
        icon: Archive,
        homeTone: "from-slate-400 to-zinc-500",
        fallbackMinRole: "SUPER_ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/telemetry-archive", "SUPER_ADMIN"),
      },
      {
        id: "telemetry-insights",
        path: "/admin/telemetry-insights",
        label: "遥测历史分析",
        icon: PieChart,
        homeTone: "from-amber-400 to-orange-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/telemetry-insights", "ADMIN"),
      },
      {
        id: "telemetry-insights-config",
        path: "/admin/telemetry-insights-config",
        label: "遥测对比组配置",
        icon: LineChart,
        homeTone: "from-orange-400 to-amber-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/telemetry-insights-config", "ADMIN"),
      },
      {
        id: "animal-tel",
        path: "/animal-room-telemetry",
        label: "动物房温湿度监测",
        icon: Thermometer,
        homeTone: "from-red-400 to-rose-500",
        fallbackMinRole: "ADMIN",
        telemetry: true,
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/animal-room-telemetry", "ADMIN"),
      },
      {
        id: "animal-cockpit",
        path: "/animal-room-cockpit",
        label: "动物房驾驶舱",
        icon: BarChart3,
        homeTone: "from-cyan-400 to-indigo-500",
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
        homeTone: "from-cyan-400 to-indigo-500",
        fallbackMinRole: "ADMIN",
        telemetry: true,
        telemetryReturnStorageKey: DIGITAL_TWIN_SCREEN_RETURN_TO_KEY,
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/digital-twin-screen", "ADMIN"),
      },
      {
        id: "digital-twin-3d",
        path: "/digital-twin-3d",
        label: "3D 楼盘",
        icon: Monitor,
        homeTone: "from-sky-400 to-violet-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/digital-twin-3d", "ADMIN"),
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
        homeTone: "from-emerald-400 to-green-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/door-group-storage", "ADMIN"),
      },
      {
        id: "device-ch",
        path: "/admin/device-channels",
        label: "通道编码",
        icon: BarChart3,
        homeTone: "from-lime-400 to-green-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/device-channels", "ADMIN"),
      },
      {
        id: "aro-rooms",
        path: "/admin/aro-rooms",
        label: "ARO房间",
        icon: MapPin,
        homeTone: "from-fuchsia-400 to-violet-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => ctx.flags.canViewMetaStorage && show(ctx, "/admin/aro-rooms", "ADMIN"),
      },
      {
        id: "cage",
        path: "/admin/cage-shelves",
        label: "笼架信息",
        icon: LayoutGrid,
        homeTone: "from-orange-400 to-amber-500",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canAssetOps && show(ctx, "/admin/cage-shelves", "STAFF"),
      },
      {
        id: "cage-index",
        path: "/admin/cage-shelf-indexes",
        label: "笼架落库索引",
        icon: TableProperties,
        homeTone: "from-amber-400 to-orange-500",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canAssetOps && show(ctx, "/admin/cage-shelf-indexes", "STAFF"),
      },
      {
        id: "cage-special-status",
        path: "/admin/cage-shelves/special-status",
        label: "笼架特殊状态",
        icon: AlertTriangle,
        homeTone: "from-amber-400 to-orange-500",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canAssetOps && show(ctx, "/admin/cage-shelves/special-status", "STAFF"),
      },
      {
        id: "aro-binding",
        path: "/admin/aro-binding",
        label: "培训管理",
        icon: KeyRound,
        homeTone: "from-blue-400 to-cyan-500",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => show(ctx, "/admin/aro-binding", "STAFF"),
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
        homeTone: "from-emerald-400 to-teal-500",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canAssetOps && show(ctx, "/admin/facility-maintenance", "STAFF"),
      },
      {
        id: "asset-rec",
        path: "/admin/asset-records",
        label: "资产记录",
        icon: Archive,
        homeTone: "from-slate-400 to-zinc-500",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canAssetOps && show(ctx, "/admin/asset-records", "STAFF"),
      },
      {
        id: "asset-xfer",
        path: "/admin/asset-transfer-records",
        label: "转移记录",
        icon: ArrowLeftRight,
        homeTone: "from-orange-400 to-amber-500",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => ctx.flags.canAssetOps && show(ctx, "/admin/asset-transfer-records", "STAFF"),
      },
      {
        id: "file-templates",
        path: "/admin/file-templates",
        label: "文件模板库",
        icon: Download,
        homeTone: "from-rose-400 to-pink-500",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => show(ctx, "/admin/file-templates", "STAFF"),
      },
      {
        id: "report-form",
        path: "/admin/report-form",
        label: "填报报表管理",
        icon: Table2,
        homeTone: "from-emerald-400 to-teal-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => show(ctx, "/admin/report-form", "ADMIN"),
      },
      {
        id: "report-fill",
        path: "/admin/report-fill",
        label: "填报中心",
        icon: ClipboardCheck,
        homeTone: "from-violet-400 to-purple-500",
        fallbackMinRole: "STAFF",
        sidebarVisible: (ctx) => show(ctx, "/admin/report-fill", "STAFF"),
      },
      {
        id: "analytics",
        path: "/admin/analytics",
        label: "统计与审计",
        icon: PieChart,
        homeTone: "from-violet-400 to-indigo-500",
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
            homeTone: "from-orange-400 to-amber-500",
            fallbackMinRole: "STAFF",
            badgeTextKey: "repairText",
            sidebarVisible: (ctx) => ctx.flags.canRepairRequest && show(ctx, "/admin/repair-request", "STAFF"),
          },
          {
            id: "repair-proc",
            path: "/admin/repair-process",
            label: "报修处理",
            icon: ClipboardCheck,
            homeTone: "from-amber-400 to-orange-500",
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
            homeTone: "from-green-400 to-emerald-500",
            fallbackMinRole: "STAFF",
            badgeTextKey: "purchaseText",
            sidebarVisible: (ctx) => ctx.flags.canPurchaseRequest && show(ctx, "/admin/purchase-request", "STAFF"),
          },
          {
            id: "purchase-proc",
            path: "/admin/purchase-process",
            label: "采购处理",
            icon: CircleCheck,
            homeTone: "from-lime-400 to-green-500",
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
            homeTone: "from-sky-400 to-blue-500",
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
            homeTone: "from-violet-400 to-purple-500",
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
    title: "学生审核",
    items: [
      {
        id: "material-review-pending",
        path: "/admin/material/review",
        label: "学生审核",
        icon: ClipboardCheck,
        homeTone: "from-rose-400 to-pink-500",
        fallbackMinRole: "ADMIN",
        badgeTextKey: "processMaterialText",
        sidebarVisible: (ctx) => show(ctx, "/admin/material/review", "ADMIN"),
      },
      {
        id: "material-manage",
        path: "/admin/material/manage",
        label: "物品管理",
        icon: Package,
        homeTone: "from-emerald-400 to-green-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => show(ctx, "/admin/material/manage", "ADMIN"),
      },
      {
        id: "material-audit-export",
        path: "/admin/material/audit-export",
        label: "申领审计导出",
        icon: Download,
        homeTone: "from-amber-400 to-orange-500",
        fallbackMinRole: "ADMIN",
        sidebarVisible: (ctx) => show(ctx, "/admin/material/audit-export", "ADMIN"),
      },
    ],
  },
  {
    id: "ai-lab",
    title: "AI 实验室",
    items: [
      {
        id: "conversation-archive",
        path: "/admin/conversation-archive",
        label: "用户对话存档",
        icon: MessagesSquare,
        homeTone: "from-violet-400 to-fuchsia-500",
        fallbackMinRole: "ADMIN",
        alias: ["对话", "AI", "存档", "conversation", "chat", "archive"],
        sidebarVisible: (ctx) => show(ctx, "/admin/conversation-archive", "ADMIN"),
      },
    ],
  },
];

const PATH_TITLE_MAP: Record<string, string> = Object.fromEntries(
  ADMIN_NAV_REGISTRY.flatMap((g) => collectRegistryGroupItems(g).map((it) => [it.path.replace(/\/+/g, "/"), it.label]))
);

PATH_TITLE_MAP["/admin/dahua-swing-tasks"] = "门禁数据工作台";
PATH_TITLE_MAP["/admin/dahua-swing-stats-tasks"] = "门禁数据工作台";
PATH_TITLE_MAP["/admin/dahua-swing-stats-backfill"] = "门禁数据工作台";
PATH_TITLE_MAP["/admin/dahua-swing-records"] = "门禁数据工作台";
PATH_TITLE_MAP["/admin/access-audit-source"] = "门禁数据工作台";
PATH_TITLE_MAP["/admin/access-fusion"] = "门禁数据工作台";
PATH_TITLE_MAP["/admin/access-clean-rule-profiles"] = "门禁数据工作台";

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
    p === "/admin/cage-shelves/special-status"
  ) {
    return "ARO 房间与联动";
  }
  if (
    p === "/admin/dahua-issue" ||
    p === "/admin/door-control" ||
    p.startsWith("/admin/access-rules") ||
    p.startsWith("/admin/dahua-swing-") ||
    p === "/admin/access-audit-source" ||
    p === "/admin/access-fusion" ||
    p === "/admin/access-clean-rule-profiles" ||
    p === "/admin/automation-logs" ||
    p.startsWith("/admin/department-storage") ||
    p.startsWith("/admin/telemetry-") ||
    p === "/animal-room-telemetry" ||
    p === "/animal-room-cockpit" ||
    p === "/digital-twin-screen" ||
    p === "/digital-twin-3d"
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
    p === "/admin/facility-maintenance" ||
    p === "/admin/report-form" ||
    p === "/admin/report-fill"
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
    p.startsWith("/admin/settings/") ||
    p === "/admin/api-docs" ||
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
