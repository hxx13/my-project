import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PortalHeader } from "@/features/portal/PortalHeader";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { useGoBack } from "@/features/aup/hooks/useGoBack";

type NavItem = { path: string; label: string; icon: string; emphasize?: boolean };
type NavSection = { title: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    title: "门户与内容",
    items: [
      { path: "/content-manager/content", label: "内容管理", icon: "📋" },
      { path: "/content-manager/categories", label: "分类管理", icon: "📂" },
      { path: "/content-manager/pages", label: "页面管理", icon: "📄" },
      { path: "/content-manager/student-faq", label: "学生Q&A", icon: "❓" },
    ],
  },
  {
    title: "AUP",
    items: [
      { path: "/content-manager/aup-template", label: "AUP 模板", icon: "🧬" },
      { path: "/content-manager/aup-dict", label: "AUP 字典", icon: "📚" },
      { path: "/content-manager/aup-reviewers", label: "AUP 审查人", icon: "👥" },
    ],
  },
  {
    title: "NHP · 配置",
    items: [
      { path: "/content-manager/nhp-codelist", label: "码表", icon: "🔗" },
      { path: "/content-manager/nhp-template", label: "模板发布", icon: "🧫" },
      { path: "/content-manager/nhp-visits", label: "访视/时点", icon: "🕐" },
      { path: "/content-manager/nhp-event-assignment", label: "事件指派", icon: "🔀" },
      { path: "/content-manager/nhp-idrules", label: "编码规则", icon: "#️⃣" },
      { path: "/content-manager/nhp-event-rules", label: "事件规则", icon: "⚙️" },
      { path: "/content-manager/nhp-standards", label: "标准库", icon: "📐" },
    ],
  },
  {
    title: "NHP · 治理",
    items: [
      { path: "/content-manager/nhp-quality", label: "数据质量", icon: "📈" },
      { path: "/content-manager/nhp-audit", label: "审计留痕", icon: "🛡️" },
      { path: "/content-manager/nhp-snapshots", label: "快照管理", icon: "📸" },
      { path: "/content-manager/nhp-codelist-review", label: "码表审核", icon: "🔍" },
    ],
  },
  {
    title: "NHP · 采集",
    items: [
      { path: "/content-manager/nhp-subjects", label: "动物管理", icon: "🧬" },
      { path: "/content-manager/nhp-records", label: "实例管理", icon: "📁" },
    ],
  },
];

export default function PortalContentAdminShell() {
  const location = useLocation();
  const goBack = useGoBack("/content-manager/content");

  // 鉴权：未登录 → 首页，非 ADMIN → 首页
  if (!authStorage.hasToken()) return <Navigate to="/" replace />;
  if (!hasMinRole(authStorage.getRole(), "ADMIN")) return <Navigate to="/" replace />;

  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const isNhpFillLike =
    pathname.includes("/content-manager/nhp-entry") ||
    pathname.includes("/content-manager/nhp-records") ||
    pathname.includes("/content-manager/nhp-subjects");

  const isNhpTemplateEditor = pathname.includes("/content-manager/nhp-template/edit");
  const isNhpTemplateList = pathname === "/content-manager/nhp-template";
  const isNhpFieldShell =
    pathname === "/content-manager/nhp-field" || pathname.startsWith("/content-manager/nhp-field/");
  const isNhpCodelist = pathname === "/content-manager/nhp-codelist";

  const isEditor = pathname.includes("/content/new") || pathname.includes("/edit") || pathname.match(/\/content-manager\/pages\/(about|faq|contact|service-guide)$/);
  const isSpecial = pathname.includes("/content/recycle");

  // 模板编辑器 / 工作台列表：壳 main 裁剪，由页内左右栏各自滚动
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
      {/* 复用门户 PortalHeader */}
      <PortalHeader onOpenLogin={() => {}} />

      {/* 次级导航：返回入口（优先 location.state.returnTo，保留筛选/上下文） */}
      <div className="flex shrink-0 items-center gap-3 bg-[#1e293b] border-t border-white/10 px-6 py-2">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
        >
          ← 返回
        </button>
        <span className="h-4 w-px bg-white/15" />
        <span className="text-xs font-semibold text-white/80">内容管理</span>
      </div>

      {/* 主体 */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* 左侧模块导航 — 列表和回收站模式 */}
        {(!isEditor || isSpecial) && (
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
                            : item.emphasize
                              ? "text-sky-200/90 font-semibold hover:bg-white/[0.06] hover:text-white"
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
        )}

        {/* 右侧内容区：NHP 填写/预览随内容增高、由本 main 纵向滚动（sticky 约束盒需盖住全文）；其它页仍裁剪由子页自管 */}
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
