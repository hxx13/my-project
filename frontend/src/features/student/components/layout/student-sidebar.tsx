import { NavLink } from "react-router-dom";
import {
  Home,
  FileText,
  Key,
  User,
  Settings,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StudentSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  to: string;
  icon: React.FC<{ className?: string }>;
  label: string;
}

const navItems: NavItem[] = [
  { to: "/student/home", icon: Home, label: "首页" },
  { to: "/student/records", icon: FileText, label: "出入记录" },
  { to: "/student/permissions", icon: Key, label: "门禁权限" },
  { to: "/student/profile", icon: User, label: "个人档案" },
  { to: "/student/settings", icon: Settings, label: "账户设置" },
];

export function StudentSidebar({ collapsed, onToggle }: StudentSidebarProps) {
  return (
    <aside
      className={cn(
        "flex flex-col bg-[var(--student-canvas)] border-r border-[var(--student-hairline)] transition-all duration-200 shrink-0",
        collapsed ? "w-14" : "w-60",
      )}
      aria-label="学生端侧边栏导航"
    >
      {/* Logo / Brand area */}
      <div
        className={cn(
          "flex items-center h-14 shrink-0 border-b border-[var(--student-hairline)]",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        {!collapsed && (
          <span className="text-lg font-semibold text-[var(--student-ink)] tracking-tight truncate">
            学生中心
          </span>
        )}
      </div>

      {/* Navigation items */}
      <nav className="flex-1 py-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md text-sm transition-colors",
                collapsed ? "justify-center mx-2 py-2.5 px-0" : "mx-2 py-2.5 px-3",
                isActive
                  ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)] border-l-[3px] border-[var(--student-primary)] font-medium"
                  : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] border-l-[3px] border-transparent",
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="shrink-0 border-t border-[var(--student-hairline)] p-2">
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          className={cn(
            "flex w-full items-center gap-2 rounded-md py-2.5 text-sm text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] transition-colors",
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
