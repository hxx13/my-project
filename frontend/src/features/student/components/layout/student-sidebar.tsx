import { NavLink } from "react-router-dom";
import {
  Home, FileText, DoorOpen, BarChart3, Bell,
  MessageSquare, Settings, LayoutGrid, Package,
  ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SHSMU_LOGO_URL } from "@/constants/shsmuBranding";
import { useState } from "react";

interface StudentSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  to: string;
  icon: React.FC<{ className?: string }>;
  label: string;
  badge?: number;
}

interface NavGroup {
  type: "item";
  item: NavItem;
}

interface NavDivider {
  type: "divider";
  label: string;
}

type NavEntry = NavGroup | NavDivider;

const navEntries: NavEntry[] = [
  { type: "item", item: { to: "/student/home", icon: Home, label: "首页" } },
  { type: "divider", label: "空间" },
  { type: "item", item: { to: "/student/cage-shelf", icon: LayoutGrid, label: "笼架信息" } },
  { type: "item", item: { to: "/student/rooms", icon: DoorOpen, label: "我的房间" } },
  { type: "divider", label: "物品" },
  { type: "item", item: { to: "/student/material", icon: Package, label: "申领物品" } },
  { type: "item", item: { to: "/student/material/requests", icon: FileText, label: "我的申领" } },
  { type: "item", item: { to: "/student/material/stats", icon: BarChart3, label: "物品统计" } },
  { type: "divider", label: "数据" },
  { type: "item", item: { to: "/student/records", icon: FileText, label: "出入记录" } },
  { type: "item", item: { to: "/student/stats", icon: BarChart3, label: "数据统计" } },
];

const bottomItems: NavItem[] = [
  { to: "/student/notifications", icon: Bell, label: "通知" },
  { to: "/student/feedback", icon: MessageSquare, label: "帮助反馈" },
  { to: "/student/settings", icon: Settings, label: "设置" },
];

function SidebarNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md text-sm transition-colors",
          collapsed ? "justify-center mx-2 py-2.5 px-0" : "mx-2 py-2.5 px-3",
          isActive
            ? "bg-[var(--student-sidebar-active-bg)] text-[var(--student-sidebar-ink)] border-l-[3px] border-[var(--student-sidebar-active-border)] font-medium"
            : "text-[var(--student-sidebar-ink)]/70 hover:bg-[var(--student-sidebar-hover)] hover:text-[var(--student-sidebar-ink)] border-l-[3px] border-transparent",
        )
      }
    >
      <item.icon className="h-5 w-5 shrink-0" />
      {!collapsed && (
        <>
          <span className="truncate flex-1">{item.label}</span>
          {item.badge != null && item.badge > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-[var(--student-sidebar-active-border)] px-1.5 text-[10px] font-semibold text-white">
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export function StudentSidebar({ collapsed, onToggle }: StudentSidebarProps) {
  const [logoBroken, setLogoBroken] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col bg-[var(--student-sidebar-bg)] border-r border-[var(--student-sidebar-hairline)] transition-all duration-200 shrink-0",
        collapsed ? "w-14" : "w-60",
      )}
      aria-label="学生端侧边栏导航"
    >
      {/* Logo / Brand area */}
      <div
        className={cn(
          "flex items-center h-14 shrink-0 border-b border-[var(--student-sidebar-hairline)]",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        {logoBroken ? (
          <span className="text-lg font-semibold text-[var(--student-sidebar-ink)] tracking-tight truncate">
            学生中心
          </span>
        ) : (
          <img
            src={SHSMU_LOGO_URL}
            alt="上海交通大学医学院"
            className={cn(
              "object-contain object-left",
              collapsed ? "h-8 w-8" : "h-10 w-auto max-w-[min(100%,12rem)]",
            )}
            style={{ filter: "brightness(0) invert(1)" }}
            onError={() => setLogoBroken(true)}
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
        {navEntries.map((entry, i) =>
          entry.type === "divider" ? (
            <div
              key={`div-${entry.label}`}
              className={cn(
                "pt-4 pb-1 first:pt-0",
                collapsed ? "px-1" : "px-4",
              )}
            >
              {!collapsed && (
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--student-sidebar-divider-text)] select-none">
                  {entry.label}
                </span>
              )}
            </div>
          ) : (
            <SidebarNavItem key={entry.item.to} item={entry.item} collapsed={collapsed} />
          ),
        )}
      </nav>

      {/* Bottom nav */}
      <div className="shrink-0 border-t border-[var(--student-sidebar-hairline)] py-2 space-y-0.5">
        {bottomItems.map((item) => (
          <SidebarNavItem key={item.to} item={item} collapsed={collapsed} />
        ))}
      </div>

      {/* Collapse toggle */}
      <div className="shrink-0 border-t border-[var(--student-sidebar-hairline)] p-2">
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          className={cn(
            "flex w-full items-center gap-2 rounded-md py-2.5 text-sm text-[var(--student-sidebar-ink)]/60 hover:bg-[var(--student-sidebar-hover)] hover:text-[var(--student-sidebar-ink)] transition-colors",
            collapsed ? "justify-center px-0" : "px-3",
          )}
        >
          {collapsed ? (
            <ChevronsRight className="h-5 w-5 shrink-0" />
          ) : (
            <>
              <ChevronsLeft className="h-5 w-5 shrink-0" />
              <span>收起侧栏</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
