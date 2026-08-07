import { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SHSMU_LOGO_URL } from "@/constants/shsmuBranding";
import { authStorage } from "@/features/auth/authStorage";
import { resolveRootEntryPath } from "@/features/auth/postLoginNavigation";
import { fullLogout } from "@/features/auth/impersonation";
import { ChevronDown, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Nav data                                                            */
/* ------------------------------------------------------------------ */

interface DropdownItem { label: string; href: string; desc?: string }
interface NavEntry { label: string; href: string; children?: DropdownItem[] }

const NAV_ENTRIES: NavEntry[] = [
  { label: "首页", href: "#" },
  {
    label: "模型资源", href: "#model-resource",
    children: [
      { label: "基因编辑模型", href: "#model-resource", desc: "CRISPR/Cas9 基因敲除与敲入" },
      { label: "免疫缺陷模型", href: "#model-resource", desc: "NSG/NOG 等重度免疫缺陷" },
      { label: "人源化模型", href: "#model-resource", desc: "靶点人源化与免疫系统重建" },
      { label: "疾病模型", href: "#model-resource", desc: "肿瘤/代谢/神经退行性疾病" },
      { label: "工具鼠与繁殖", href: "#model-resource", desc: "Cre/Flp工具鼠及育种服务" },
    ],
  },
  {
    label: "新闻动态", href: "#news",
    children: [
      { label: "文章干货", href: "#news", desc: "技术分享与研究前沿" },
      { label: "通知公告", href: "#news", desc: "平台运营与管理通知" },
      { label: "平台更新", href: "#news", desc: "系统升级与服务变更" },
    ],
  },
  {
    label: "关于我们", href: "#about",
    children: [
      { label: "部门简介", href: "#about", desc: "实验动物科学部概况" },
      { label: "服务指南", href: "#about", desc: "使用流程与收费标准" },
      { label: "常见问题", href: "#", desc: "使用帮助与 FAQ" },
      { label: "联系我们", href: "#", desc: "地址与联系方式" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Dropdown — dark theme, solid bg                                    */
/* ------------------------------------------------------------------ */

function NavDropdown({ entry, onClose }: { entry: NavEntry; onClose: () => void }) {
  if (!entry.children?.length) return null;
  return (
    <div
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-56 rounded-xl border border-white/10 bg-[#1e293b] shadow-xl py-1 z-50"
      onMouseLeave={onClose}
    >
      {entry.children.map((item) => (
        <a key={item.label} href={item.href} onClick={onClose}
          className="block px-4 py-2.5 hover:bg-white/5 transition-colors">
          <div className="text-sm font-medium text-white/90">{item.label}</div>
          {item.desc && <div className="text-xs text-white/40 mt-0.5">{item.desc}</div>}
        </a>
      ))}
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
  const hasToken = authStorage.hasToken();
  const role = authStorage.getRole() ?? "MEMBER";
  const userInfo = authStorage.getUserInfo();
  const displayName = userInfo?.displayName || userInfo?.username || "";
  const avatarLetter = displayName ? displayName.charAt(0) : "U";
  const backgroundTarget = useMemo(() => hasToken ? resolveRootEntryPath(role) : null, [hasToken, role]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const dropdownTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => { if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  const scrollTo = (href: string) => {
    setMobileOpen(false); setActiveDropdown(null);
    if (href === "#") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  };

  const hoverIn = (label: string) => { if (dropdownTimer.current) { clearTimeout(dropdownTimer.current); dropdownTimer.current = null; } setActiveDropdown(label); };
  const hoverOut = () => { dropdownTimer.current = window.setTimeout(() => setActiveDropdown(null), 120); };

  return (
    <>
      <header className="sticky top-0 z-[var(--z-sticky)] flex h-16 items-center justify-between border-b border-white/10 bg-[#0f172a]/95 backdrop-blur-sm px-6">
        {/* Logo */}
        <a href="/#" className="flex-shrink-0" aria-label="首页">
          <img src={SHSMU_LOGO_URL} alt="上海交通大学医学院" className="h-9 w-auto object-contain object-left" style={{ filter: "brightness(0) invert(1)" }} />
        </a>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {NAV_ENTRIES.map((entry) => {
            const hasKids = !!(entry.children?.length);
            const isOpen = activeDropdown === entry.label;
            return (
              <div key={entry.label} className="relative" onMouseEnter={() => hasKids && hoverIn(entry.label)} onMouseLeave={() => hasKids && hoverOut()}>
                <button type="button" onClick={() => hasKids ? (isOpen ? setActiveDropdown(null) : setActiveDropdown(entry.label)) : scrollTo(entry.href)}
                  className={cn("flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                    isOpen ? "text-white bg-white/10" : "text-white/60 hover:text-white/90 hover:bg-white/5")}>
                  {entry.label}{hasKids && <ChevronDown className={cn("size-3 transition", isOpen && "rotate-180")} />}
                </button>
                {hasKids && isOpen && <NavDropdown entry={entry} onClose={() => setActiveDropdown(null)} />}
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
            onClick={() => navigate(hasToken ? "/m/home" : "/m/login")}
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
                <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-white/10 bg-[#1e293b] shadow-xl py-1 z-50">
                  <div className="px-4 py-2 text-xs text-white/40 truncate border-b border-white/5">{displayName || userInfo?.username || "已登录"}</div>
                  <button onClick={() => { setUserMenuOpen(false); navigate(backgroundTarget || "/"); }}
                    className="w-full text-left px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">进入后台</button>
                  <button onClick={() => { setUserMenuOpen(false); navigate("/m/home"); }}
                    className="w-full text-left px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                    <Smartphone className="size-3.5 inline mr-1.5 opacity-60" />
                    切换到手机版
                  </button>
                  <button onClick={() => { setUserMenuOpen(false); fullLogout(); }}
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors">退出登录</button>
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
            {NAV_ENTRIES.map((entry) => (
              <div key={entry.label}>
                <button onClick={() => scrollTo(entry.href)}
                  className="w-full text-left px-3 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors">{entry.label}</button>
                {entry.children?.map((c) => (
                  <button key={c.label} onClick={() => scrollTo(c.href)}
                    className="w-full text-left pl-8 pr-3 py-1.5 text-xs text-white/40">{c.label}</button>
                ))}
              </div>
            ))}
            <hr className="border-white/10 my-2" />
            <button onClick={() => { setMobileOpen(false); navigate("/m/login"); }}
              className="text-left px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg">
              <Smartphone className="size-3.5 inline mr-1.5 opacity-60" />
              手机版
            </button>
            {hasToken ? (
              <>
                <button onClick={() => { setMobileOpen(false); navigate(backgroundTarget || "/"); }}
                  className="text-left px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg">进入后台</button>
                <button onClick={() => { setMobileOpen(false); fullLogout(); }}
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
