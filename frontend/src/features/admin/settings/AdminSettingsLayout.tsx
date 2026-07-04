import { useState, useMemo } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import {
  Sliders,
  Palette,
  Bell,
  Fingerprint,
  CalendarClock,
  PlugZap,
  KeyRound,
  AlertTriangle,
  LayoutDashboard,
  Search,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { AdminPageShell } from "@/components/admin/AdminPageShell";

const SETTINGS_SUB_PAGES = [
  { path: "general",        label: "通用设置",   icon: Sliders,         minRole: "ADMIN" },
  { path: "appearance",     label: "外观与品牌", icon: Palette,         minRole: "ADMIN" },
  { path: "notifications",  label: "通知配置",   icon: Bell,            minRole: "ADMIN" },
  { path: "access-control", label: "门禁与人脸", icon: Fingerprint,     minRole: "ADMIN" },
  { path: "scheduler",      label: "定时任务",   icon: CalendarClock,   minRole: "ADMIN" },
  { path: "integrations",   label: "集成与凭证", icon: PlugZap,         minRole: "SUPER_ADMIN" },
  { path: "permissions",    label: "页面权限",   icon: KeyRound,        minRole: "SUPER_ADMIN" },
  { path: "danger-zone",       label: "危险操作",   icon: AlertTriangle,   minRole: "SUPER_ADMIN", danger: true },
  { path: "dashboard-preview", label: "仪表盘预览", icon: LayoutDashboard,  minRole: "ADMIN" },
];

const STAFF_NS = "/console";

export default function AdminSettingsLayout() {
  const role = authStorage.getRole();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const visiblePages = useMemo(
    () => SETTINGS_SUB_PAGES.filter((page) => hasMinRole(role, page.minRole)),
    [role],
  );

  const activePath = useMemo(() => {
    const segments = location.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "general";
  }, [location.pathname]);

  const activePageLabel = useMemo(() => {
    const page = SETTINGS_SUB_PAGES.find((p) => p.path === activePath);
    return page?.label ?? activePath;
  }, [activePath]);

  const normalPages = useMemo(() => visiblePages.filter((p) => !p.danger), [visiblePages]);
  const dangerPages = useMemo(() => visiblePages.filter((p) => p.danger), [visiblePages]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      console.log("[AdminSettings] 搜索:", searchQuery);
    }
  };

  return (
    <AdminPageShell
      title="系统设置"
      description="统一管理平台全局配置、外观、通知、门禁、集成与权限等模块。"
      actions={
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-color-text-tertiary)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="搜索设置项…"
            className="h-9 w-full rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] pl-9 pr-3 text-sm text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] outline-none transition-colors focus:border-[var(--app-color-accent-secondary)] focus:ring-1 focus:ring-[var(--app-color-accent-secondary)]/20"
          />
        </div>
      }
    >
      <div className="flex gap-6 items-start">
        {/* ── Left secondary sidebar (sticky, w-56) ── */}
        <nav
          className="sticky top-4 z-[var(--z-sticky)] w-56 shrink-0"
          aria-label="设置子页面导航"
        >
          <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm">
            <div className="border-b border-[var(--app-color-border-default)] px-3 py-2.5">
              <p className="text-xs font-semibold text-[var(--app-color-text-primary)]">
                设置分类
              </p>
            </div>
            <div className="space-y-0.5 px-2 py-2">
              {normalPages.map((page) => {
                const isActive = activePath === page.path;
                const Icon = page.icon;
                return (
                  <Link
                    key={page.path}
                    to={`${STAFF_NS}/admin/settings/${page.path}`}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-[var(--app-color-primary)]/10 text-[var(--app-color-primary)]"
                        : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{page.label}</span>
                  </Link>
                );
              })}

              {dangerPages.length > 0 && (
                <>
                  <div className="my-2 border-t border-[var(--app-color-border-default)]" />
                  {dangerPages.map((page) => {
                    const isActive = activePath === page.path;
                    const Icon = page.icon;
                    return (
                      <Link
                        key={page.path}
                        to={`${STAFF_NS}/admin/settings/${page.path}`}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-text-danger)]"
                            : "text-[var(--app-color-text-danger)]/80 hover:bg-[var(--app-color-feedback-danger-soft)]/50 hover:text-[var(--app-color-text-danger)]",
                        )}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{page.label}</span>
                      </Link>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </nav>

        {/* ── Right content area ── */}
        <div className="min-w-0 flex-1">
          {/* Breadcrumb header */}
          <div className="mb-4 flex items-center gap-2 border-b border-[var(--app-color-border-default)] pb-3">
            <button
              type="button"
              onClick={() => navigate(`${STAFF_NS}/admin`)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-color-text-tertiary)] transition-colors hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
              aria-label="返回管理后台"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-[var(--app-color-text-tertiary)]">系统设置</span>
            <span className="text-sm text-[var(--app-color-text-tertiary)]">/</span>
            <h3 className="text-base font-semibold text-[var(--app-color-text-primary)]">
              {activePageLabel}
            </h3>
          </div>

          <Outlet />
        </div>
      </div>
    </AdminPageShell>
  );
}
