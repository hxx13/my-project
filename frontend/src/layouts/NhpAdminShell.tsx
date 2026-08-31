import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { PortalHeader } from "@/features/portal/PortalHeader";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { fetchMyIdentity } from "@/api/domains/personIdentity.api";
import { useGoBack } from "@/features/aup/hooks/useGoBack";

type NavItem = { path: string; label: string; icon: string };
type NavSection = { title: string; items: NavItem[] };

const NHP_EXPERT_CODE = "NHP_EXPERT";

const NAV_SECTIONS: NavSection[] = [
  {
    title: "采集设计",
    items: [
      { path: "/nhp-admin/template", label: "表单模板", icon: "🧫" },
      { path: "/nhp-admin/event-assignment", label: "事件指派", icon: "🔀" },
      { path: "/nhp-admin/idrules", label: "编号规则", icon: "#️⃣" },
      { path: "/nhp-admin/event-rules", label: "流转规则", icon: "⚙️" },
    ],
  },
  {
    title: "数据字典",
    items: [
      { path: "/nhp-admin/field", label: "字段字典", icon: "📚" },
      { path: "/nhp-admin/codelist", label: "码表字典", icon: "🔗" },
    ],
  },
  {
    title: "数据采集",
    items: [
      { path: "/nhp-admin/records", label: "项目管理", icon: "📁" },
      { path: "/nhp-admin/subjects", label: "研究对象", icon: "🧬" },
    ],
  },
  {
    title: "质量与治理",
    items: [
      { path: "/nhp-admin/standards", label: "标准库", icon: "📐" },
      { path: "/nhp-admin/quality", label: "数据质量", icon: "📈" },
      { path: "/nhp-admin/audit", label: "审计日志", icon: "🛡️" },
      { path: "/nhp-admin/snapshots", label: "数据快照", icon: "📸" },
    ],
  },
  {
    title: "权限与团队",
    items: [
      { path: "/nhp-admin/permissions", label: "权限配置", icon: "🔐" },
      { path: "/nhp-admin/team", label: "我的团队", icon: "👥" },
    ],
  },
];

export default function NhpAdminShell() {
  const location = useLocation();
  const goBack = useGoBack("/nhp-admin/template");

  const hasToken = authStorage.hasToken();
  const role = authStorage.getRole() ?? "MEMBER";
  const { data: myIdentity, isLoading } = useQuery({
    queryKey: ["personIdentity", "me"] as const,
    queryFn: fetchMyIdentity,
    enabled: hasToken,
  });
  const isNhpExpert = (myIdentity ?? []).some((t) => t.code === NHP_EXPERT_CODE);
  const allowed = hasMinRole(role, "PLATFORM_OWNER") || isNhpExpert;

  // 鉴权：未登录 → 首页；非 NHP专家/平台所有者 → 首页
  if (!hasToken) return <Navigate to="/" replace />;
  if (isLoading) {
    return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>加载中…</div>;
  }
  if (!allowed) return <Navigate to="/" replace />;

  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const isNhpFillLike =
    pathname.includes("/nhp-admin/entry") ||
    pathname.includes("/nhp-admin/records") ||
    pathname.includes("/nhp-admin/subjects");
  const isNhpTemplateEditor = pathname.includes("/nhp-admin/template/edit");
  const isNhpTemplateList = pathname === "/nhp-admin/template";
  const isNhpFieldShell = pathname === "/nhp-admin/field" || pathname.startsWith("/nhp-admin/field/");
  const isNhpCodelist = pathname === "/nhp-admin/codelist";

  const mainOverflowY = isNhpTemplateEditor || isNhpTemplateList || isNhpFieldShell || isNhpCodelist
    ? "hidden"
    : isNhpFillLike
      ? "auto"
      : "hidden";
  const mainBg =
    isNhpFillLike || isNhpTemplateEditor || isNhpTemplateList || isNhpFieldShell || isNhpCodelist
      ? "#f4f6f8"
      : "#f5f3f0";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f5f3f0" }}>
      <PortalHeader onOpenLogin={() => {}} />

      {/* 次级导航 */}
      <div className="flex shrink-0 items-center gap-3 bg-[#1e293b] border-t border-white/10 px-6 py-2">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
        >
          ← 返回
        </button>
        <span className="h-4 w-px bg-white/15" />
        <span className="text-xs font-semibold text-white/80">后台配置</span>
      </div>

      {/* 主体 */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside style={{
          width: 200, flexShrink: 0, background: "#0f172a",
          display: "flex", flexDirection: "column", overflowY: "auto",
        }}>
          <nav style={{ flex: 1, padding: "8px 8px 16px" }}>
            {NAV_SECTIONS.map((section) => (
              <div key={section.title} style={{ marginBottom: 10 }}>
                <div style={{
                  padding: "8px 12px 4px", fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.25)",
                }}>
                  {section.title}
                </div>
                {section.items.map((item) => {
                  const active = pathname.startsWith(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 text-[12px] transition-colors",
                        active
                          ? "bg-white/[0.08] text-white font-semibold"
                          : "text-white/50 hover:bg-white/[0.04] hover:text-white/80",
                      )}
                      style={{ paddingTop: 7, paddingBottom: 7 }}
                      state={active ? undefined : { returnTo: `${pathname}${location.search}` }}
                    >
                      <span style={{ fontSize: 14 }}>{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        <main
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflowX: "clip",
            overflowY: mainOverflowY,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            background: mainBg,
            colorScheme: "light",
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
