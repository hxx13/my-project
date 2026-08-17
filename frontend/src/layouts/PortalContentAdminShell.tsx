import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PortalHeader } from "@/features/portal/PortalHeader";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { useGoBack } from "@/features/aup/hooks/useGoBack";

const NAV_ITEMS = [
  { path: "/content-manager/content", label: "内容管理", icon: "📋" },
  { path: "/content-manager/categories", label: "分类管理", icon: "📂" },
  { path: "/content-manager/pages", label: "页面管理", icon: "📄" },
  { path: "/content-manager/student-faq", label: "学生Q&A", icon: "❓" },
  { path: "/content-manager/aup-template", label: "AUP 模板", icon: "🧬" },
  { path: "/content-manager/aup-dict", label: "AUP 字典", icon: "📚" },
  { path: "/content-manager/aup-reviewers", label: "AUP 审查人", icon: "👥" },
] as const;

export default function PortalContentAdminShell() {
  const location = useLocation();
  const goBack = useGoBack("/content-manager/content");

  // 鉴权：未登录 → 首页，非 ADMIN → 首页
  if (!authStorage.hasToken()) return <Navigate to="/" replace />;
  if (!hasMinRole(authStorage.getRole(), "ADMIN")) return <Navigate to="/" replace />;

  const pathname = location.pathname.replace(/\/+$/, "") || "/";

  const navItems = NAV_ITEMS;

  const isEditor = pathname.includes("/content/new") || pathname.includes("/edit") || pathname.match(/\/content-manager\/pages\/(about|faq|contact|service-guide)$/);
  const isSpecial = pathname.includes("/content/recycle");

  // 返回路径：优先从 location.state 读取，否则根据路径推断
  const state = location.state as { returnTo?: string; returnLabel?: string } | null;
  const backTo = state?.returnTo || (pathname.match(/\/content-manager\/pages\/(about|faq|contact|service-guide)/) ? "/content-manager/pages" : "/content-manager/content");
  const backLabel = state?.returnLabel || (pathname.match(/\/content-manager\/pages\//) ? "返回页面管理" : "返回内容管理");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f5f3f0" }}>
      {/* 复用门户 PortalHeader */}
      <PortalHeader onOpenLogin={() => {}} />

      {/* 次级导航：返回入口 */}
      <div className="flex shrink-0 items-center gap-3 bg-[#1e293b] border-t border-white/10 px-6 py-2">
        {isEditor ? (
          <>
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
            >
              ← 返回
            </button>
            <span className="h-4 w-px bg-white/15" />
            <span className="text-xs font-semibold text-white/80">编辑内容</span>
          </>
        ) : (
          <>
            <span className="text-xs font-semibold text-white/80">内容管理</span>
          </>
        )}
      </div>

      {/* 主体 */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* 左侧模块导航 — 列表和回收站模式 */}
        {(!isEditor || isSpecial) && (
          <aside style={{
            width: 200, flexShrink: 0, background: "#0f172a",
            display: "flex", flexDirection: "column", overflowY: "auto",
          }}>
            <div style={{
              padding: "8px 12px", fontSize: 10, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.25)",
            }}>
              门户与内容
            </div>
            <nav style={{ flex: 1, padding: "0 8px" }}>
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 text-[12px] transition-colors",
                    pathname.startsWith(item.path)
                      ? "bg-white/[0.08] text-white font-semibold"
                      : "text-white/50 hover:bg-white/[0.04] hover:text-white/80",
                  )}
                  style={{ paddingTop: 7, paddingBottom: 7 }}
                >
                  <span style={{ fontSize: 14 }}>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
        )}

        {/* 右侧内容区 */}
        <main style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column", background: "#f5f3f0" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
