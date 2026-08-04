import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SHSMU_LOGO_URL } from "@/constants/shsmuBranding";
import { authStorage } from "@/features/auth/authStorage";
import { resolveRootEntryPath } from "@/features/auth/postLoginNavigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "首页", href: "#" },
  { label: "模型资源", href: "#model-resource" },
  { label: "新闻动态", href: "#news" },
  { label: "关于我们", href: "#about" },
];

export function PortalHeader() {
  const navigate = useNavigate();
  const hasToken = authStorage.hasToken();
  const role = authStorage.getRole() ?? "MEMBER";
  const backgroundTarget = useMemo(() => {
    if (!hasToken) return null;
    return resolveRootEntryPath(role);
  }, [hasToken, role]);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleScrollTo = (href: string) => {
    setMenuOpen(false);
    if (href === "#") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] flex h-16 items-center justify-between border-b border-white/10 bg-[#0f172a]/95 backdrop-blur-sm">
      {/* Logo — larger, less gap */}
      <a href="/#" className="flex-shrink-0 pl-4" aria-label="首页">
        <img
          src={SHSMU_LOGO_URL}
          alt="上海交通大学医学院"
          className="h-10 w-auto object-contain object-left"
          style={{ filter: "brightness(0) invert(1)" }}
        />
      </a>

      {/* Desktop Nav — subtle links */}
      <nav className="hidden lg:flex items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.href}
            type="button"
            onClick={() => handleScrollTo(item.href)}
            className="px-3 py-2 text-sm text-white/60 hover:text-white/90 transition-colors"
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className="lg:hidden mr-2 p-2 text-white/80 hover:text-white"
        aria-label="菜单"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          {menuOpen ? (
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          ) : (
            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          )}
        </svg>
      </button>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div className="absolute top-16 left-0 right-0 bg-[#0f172a]/98 border-b border-white/10 lg:hidden">
          <nav className="flex flex-col p-4 gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => handleScrollTo(item.href)}
                className="text-left px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                {item.label}
              </button>
            ))}
            <hr className="border-white/10 my-2" />
            {hasToken ? (
              <button
                type="button"
                onClick={() => { setMenuOpen(false); navigate(backgroundTarget || "/"); }}
                className="text-left px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                进入后台
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); navigate("/login"); }}
                  className="text-left px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  登录
                </button>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); navigate("/student/register"); }}
                  className="text-left px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  注册
                </button>
              </>
            )}
          </nav>
        </div>
      )}

      {/* Right: subtle auth controls */}
      <div className="flex items-center pr-4">
        {hasToken ? (
          <button
            type="button"
            onClick={() => navigate(backgroundTarget || "/")}
            className="text-sm text-white/50 hover:text-white/80 transition-colors"
          >
            后台
          </button>
        ) : (
          <div className="flex items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="text-white/50 hover:text-white/80 transition-colors px-2 py-1"
            >
              登录
            </button>
            <span className="text-white/20">/</span>
            <button
              type="button"
              onClick={() => navigate("/student/register")}
              className="text-white/50 hover:text-white/80 transition-colors px-2 py-1"
            >
              注册
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
