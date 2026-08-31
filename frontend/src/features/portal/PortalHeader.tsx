import { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SHSMU_LOGO_URL } from "@/constants/shsmuBranding";
import { authStorage } from "@/features/auth/authStorage";
import { resolveRootEntryPath } from "@/features/auth/postLoginNavigation";
import { fullLogout } from "@/features/auth/impersonation";
import { hasMinRole } from "@/features/auth/roleAccess";
import { ChevronDown, ChevronRight, Smartphone, LayoutDashboard, FileEdit, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchPublicCategories } from "@/api/domains/portalContent.api";
import { fetchMyIdentity } from "@/api/domains/personIdentity.api";
import { useQuery } from "@tanstack/react-query";

/* ------------------------------------------------------------------ */
/*  Nav data                                                            */
/* ------------------------------------------------------------------ */

interface DropdownItem {
  label: string;
  href: string;
  route?: string;
  desc?: string;
  /** 向右展开的二级菜单 */
  children?: DropdownItem[];
}
interface NavEntry { label: string; href: string; route?: string; children?: DropdownItem[] }

function useNavEntries(modelCats: { name: string }[], opts: { hasToken: boolean; isNhpExpert: boolean }): NavEntry[] {
  return useMemo(() => [
    { label: "首页", href: "#", route: "/" },
    {
      label: "模型资源", href: "#model-resource", route: "/models",
      children: modelCats.length > 0
        ? modelCats.map((c) => ({ label: c.name, href: "#", route: `/models?search=${encodeURIComponent(c.name)}`, desc: `${c.name}品系` }))
        : [
            { label: "基因编辑模型", href: "#", route: "/models?search=基因编辑模型", desc: "CRISPR 基因编辑" },
            { label: "免疫缺陷模型", href: "#", route: "/models?search=免疫缺陷模型", desc: "NSG/NOG 免疫缺陷" },
            { label: "人源化模型", href: "#", route: "/models?search=人源化模型", desc: "靶点人源化" },
            { label: "疾病模型", href: "#", route: "/models?search=疾病模型", desc: "肿瘤与代谢疾病" },
            { label: "工具鼠与繁殖", href: "#", route: "/models?search=工具鼠与繁殖", desc: "Cre/Flp 工具鼠" },
          ],
    },
    {
      label: "新闻动态", href: "#news", route: "/news",
      children: [
        { label: "文章干货", href: "#", route: "/news", desc: "技术分享" },
        { label: "通知公告", href: "#", route: "/news", desc: "平台通知" },
        { label: "平台更新", href: "#", route: "/news", desc: "系统更新" },
      ],
    },
    {
      label: "实验动物", href: "#",
      children: [
        {
          label: "手术", href: "#", desc: "NHP 手术研究",
          children: [
            { label: "总览驾驶舱", href: "#", route: "/nhp/overview", desc: "研究总览" },
            { label: "进入工作台", href: "#", route: "/nhp/fill", desc: "采集与时间线" },
            { label: "审核中心", href: "#", route: "/nhp/review-center", desc: "校对复核签署" },
            ...(opts.hasToken ? [{ label: "我的团队", href: "#", route: "/nhp-team", desc: "团队协作" }] : []),
            ...(opts.hasToken && opts.isNhpExpert ? [{ label: "后台配置", href: "#", route: "/nhp-admin", desc: "研究设计配置" }] : []),
          ],
        },
        { label: "填写AUP计划书", href: "#", route: "/aup/fill", desc: "IACUC 使用计划" },
      ],
    },
    {
      label: "关于我们", href: "#about", route: "/about",
      children: [
        { label: "部门简介", href: "#", route: "/about", desc: "科学部概况" },
        { label: "服务指南", href: "#", route: "/services", desc: "流程与收费" },
        { label: "常见问题", href: "#", route: "/faq", desc: "使用帮助" },
        { label: "联系我们", href: "#", route: "/contact", desc: "联系方式" },
      ],
    },
  ], [modelCats, opts.hasToken, opts.isNhpExpert]);
}

/* ------------------------------------------------------------------ */
/*  Dropdown — dark theme, solid bg；支持向右展开的二级菜单             */
/* ------------------------------------------------------------------ */

function NavDropdown({
  entry,
  navigate,
  onNavigateClose,
}: {
  entry: NavEntry;
  navigate: ReturnType<typeof useNavigate>;
  onNavigateClose: () => void;
}) {
  const [flyoutLabel, setFlyoutLabel] = useState<string | null>(null);
  if (!entry.children?.length) return null;

  const handleClick = (item: DropdownItem) => {
    if (item.children?.length) {
      // 有子菜单：点击展开/收起二级菜单
      setFlyoutLabel((prev) => (prev === item.label ? null : item.label));
      return;
    }
    onNavigateClose();
    if (item.route) {
      navigate(item.route);
    } else if (item.href && item.href !== "#") {
      navigate("/", { state: { scrollTo: item.href } });
    }
  };

  return (
    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 pt-1 w-52 z-50">
      <div className="rounded-xl border border-white/10 bg-[#1e293b] shadow-xl py-1">
      {entry.children.map((item) => {
        const hasSub = !!(item.children?.length);
        const subOpen = flyoutLabel === item.label;
        return (
          <div key={item.label} className="relative">
            <button
              type="button"
              onClick={() => handleClick(item)}
              className={cn(
                "w-full text-left flex items-center gap-1.5 px-3 py-2 hover:bg-white/5 transition-colors",
                subOpen && "bg-white/5",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white/90 leading-snug">{item.label}</div>
                {item.desc && <div className="text-xs text-white/40 mt-px leading-snug">{item.desc}</div>}
              </div>
              {hasSub && <ChevronRight className="size-3.5 shrink-0 text-white/40" />}
            </button>
            {hasSub && subOpen && (
              <div className="absolute left-full top-0 -ml-1 pl-1 z-50">
                <div className="w-52 rounded-xl border border-white/10 bg-[#1e293b] shadow-xl py-1">
                  {item.children!.map((sub) => (
                    <button
                      key={sub.label}
                      type="button"
                      onClick={() => handleClick(sub)}
                      className="w-full text-left block px-3 py-2 hover:bg-white/5 transition-colors"
                    >
                      <div className="text-sm font-medium text-white/90 leading-snug">{sub.label}</div>
                      {sub.desc && <div className="text-xs text-white/40 mt-px leading-snug">{sub.desc}</div>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PortalHeader — full-width dark sticky + Aceternity dropdowns        */
/* ------------------------------------------------------------------ */

interface PortalHeaderProps {
  onOpenLogin: () => void;
}

export function PortalHeader({ onOpenLogin }: PortalHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const hasToken = authStorage.hasToken();

  const [modelCats, setModelCats] = useState<{ name: string }[]>([]);
  useEffect(() => {
    fetchPublicCategories("MODEL_RESOURCE").then((list) => setModelCats(list.map((c) => ({ name: c.name })))).catch(() => {});
  }, []);
  const { data: myIdentity } = useQuery({
    queryKey: ["personIdentity", "me"] as const,
    queryFn: fetchMyIdentity,
    enabled: hasToken,
  });
  const isNhpExpert = hasMinRole(authStorage.getRole(), "PLATFORM_OWNER")
    || (myIdentity ?? []).some((t) => t.code === "NHP_EXPERT");
  const navEntries = useNavEntries(modelCats, { hasToken, isNhpExpert });
  const role = authStorage.getRole() ?? "MEMBER";
  const userInfo = authStorage.getUserInfo();
  const displayName = userInfo?.displayName || userInfo?.username || "";
  const avatarLetter = displayName ? displayName.charAt(0) : "U";
  const backgroundTarget = useMemo(() => hasToken ? resolveRootEntryPath(role) : null, [hasToken, role]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => { if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  useEffect(() => {
    if (!activeDropdown) return;
    const handler = (e: MouseEvent) => { if (navRef.current && !navRef.current.contains(e.target as Node)) setActiveDropdown(null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeDropdown]);

  const scrollTo = (href: string, route?: string) => {
    setMobileOpen(false); setActiveDropdown(null);
    // 如果有独立路由且不在首页，直接导航
    if (route && !isLanding) { navigate(route); return; }
    // 如果有独立路由且在首页，优先导航到独立页面
    if (route) { navigate(route); return; }
    // 纯锚点：首页滚动 或 导航到首页后滚动
    if (href === "#") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (!isLanding) { navigate("/", { state: { scrollTo: href } }); return; }
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <header className="sticky top-0 z-[var(--z-sticky)] flex h-16 items-center justify-between border-b border-white/10 bg-[#0f172a]/95 backdrop-blur-sm px-6">
        {/* Logo */}
        <a href="/#" className="flex-shrink-0" aria-label="首页">
          <img src={SHSMU_LOGO_URL} alt="上海交通大学医学院" className="h-9 w-auto object-contain object-left" style={{ filter: "brightness(0) invert(1)" }} />
        </a>

        {/* Desktop nav */}
        <nav ref={navRef} className="hidden lg:flex items-center gap-1">
          {navEntries.map((entry) => {
            const hasKids = !!(entry.children?.length);
            const isOpen = activeDropdown === entry.label;
            return (
              <div key={entry.label} className="relative">
                <button type="button"
                  onClick={() => {
                    if (!hasKids) { scrollTo(entry.href, entry.route); return; }
                    setActiveDropdown((prev) => (prev === entry.label ? null : entry.label));
                  }}
                  className={cn("flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                    isOpen ? "text-white bg-white/10" : "text-white/60 hover:text-white/90 hover:bg-white/5")}>
                  {entry.label}{hasKids && <ChevronDown className={cn("size-3 transition", isOpen && "rotate-180")} />}
                </button>
                {hasKids && isOpen && (
                  <NavDropdown
                    entry={entry}
                    navigate={navigate}
                    onNavigateClose={() => setActiveDropdown(null)}
                  />
                )}
              </div>
            );
          })}
        </nav>

        {/* Mobile hamburger */}
        <button type="button" onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden p-2 text-white/70 hover:text-white" aria-label="菜单">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            {mobileOpen ? (
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            )}
          </svg>
        </button>

        {/* Right: user / login */}
        <div className="flex items-center gap-2" ref={userMenuRef}>
          {/* 手机版入口 */}
          <button
            type="button"
            onClick={() => navigate(hasToken ? "/m/home" : "/m/login", { state: { fromPortal: true } })}
            title="手机版"
            aria-label="手机版"
            className="flex items-center gap-1 text-sm text-white/50 hover:text-white/80 transition-colors px-2 py-1.5 rounded-lg border border-white/15 hover:border-white/30"
          >
            <Smartphone className="size-4" />
            <span className="hidden sm:inline">手机版</span>
          </button>

          {hasToken ? (
            <div className="relative">
              <button type="button" onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 hover:text-white/90 hover:bg-white/5 transition-colors">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white/90">{avatarLetter}</span>
                <span className="hidden sm:inline max-w-[80px] truncate">{displayName}</span>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-white/10 bg-[#1e293b] shadow-xl z-50 overflow-hidden">
                  {/* 用户信息 */}
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white/90 shrink-0">
                      {avatarLetter}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{displayName || userInfo?.username || "已登录"}</div>
                      <div className="text-[11px] text-white/35 mt-0.5">{role === "SUPER_ADMIN" ? "超级管理员" : role === "ADMIN" ? "管理员" : role === "SENIOR" ? "高级成员" : role === "STAFF" ? "教职工" : "成员"}</div>
                    </div>
                  </div>

                  <div className="h-px bg-white/8" />

                  {/* 工作区 */}
                  <div className="py-1">
                    <button onClick={() => { setUserMenuOpen(false); navigate(backgroundTarget || "/"); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                      <LayoutDashboard className="size-4 opacity-50" />
                      进入后台
                    </button>
                    {hasMinRole(role, "ADMIN") && (
                      <button onClick={() => { setUserMenuOpen(false); navigate("/content-manager/content"); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                        <FileEdit className="size-4 opacity-50" />
                        内容管理
                      </button>
                    )}
                  </div>

                  <div className="h-px bg-white/8" />

                  {/* 退出 + 手机版 */}
                  <div className="flex items-center px-4 py-2">
                    <button onClick={() => { setUserMenuOpen(false); fullLogout(); navigate("/"); }}
                      className="flex items-center gap-3 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors rounded px-2 py-1 -ml-2">
                      <LogOut className="size-4" />
                      退出登录
                    </button>
                    <button onClick={() => { setUserMenuOpen(false); navigate("/m/home", { state: { fromPortal: true } }); }}
                      className="ml-auto p-1.5 text-white/30 hover:text-white/60 transition-colors rounded-lg hover:bg-white/5"
                      title="手机版">
                      <Smartphone className="size-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button onClick={onOpenLogin}
              className="text-sm text-white/50 hover:text-white/80 transition-colors px-3 py-1.5 rounded-lg border border-white/15 hover:border-white/30">
              登录
            </button>
          )}
        </div>
      </header>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className="absolute top-16 inset-x-0 border-b border-white/10 shadow-xl p-4 z-40 lg:hidden"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.98)" }}
        >
          <nav className="flex flex-col gap-1">
            {navEntries.map((entry) => (
              <div key={entry.label}>
                <button onClick={() => scrollTo(entry.href, entry.route)}
                  className="w-full text-left px-3 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors">{entry.label}</button>
                {entry.children?.map((c) => (
                  <div key={c.label}>
                    {c.children?.length ? (
                      <>
                        <div className="w-full text-left pl-8 pr-3 py-1.5 text-xs text-white/50 font-medium">{c.label}</div>
                        {c.children.map((sub) => (
                          <button key={sub.label} onClick={() => scrollTo(sub.href, sub.route)}
                            className="w-full text-left pl-12 pr-3 py-1.5 text-xs text-white/40">{sub.label}</button>
                        ))}
                      </>
                    ) : (
                      <button onClick={() => scrollTo(c.href, c.route)}
                        className="w-full text-left pl-8 pr-3 py-1.5 text-xs text-white/40">{c.label}</button>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <hr className="border-white/10 my-2" />
            <button onClick={() => { setMobileOpen(false); navigate("/m/login", { state: { fromPortal: true } }); }}
              className="text-left px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg">
              <Smartphone className="size-3.5 inline mr-1.5 opacity-60" />
              手机版
            </button>
            {hasToken ? (
              <>
                <button onClick={() => { setMobileOpen(false); navigate(backgroundTarget || "/"); }}
                  className="text-left px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg">进入后台</button>
                <button onClick={() => { setMobileOpen(false); fullLogout(); navigate("/"); }}
                  className="text-left px-3 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 rounded-lg">退出登录</button>
              </>
            ) : (
              <button onClick={() => { setMobileOpen(false); onOpenLogin(); }}
                className="text-left px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg">登录</button>
            )}
          </nav>
        </div>
      )}

    </>
  );
}
