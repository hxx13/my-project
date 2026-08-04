import { useMemo } from "react";
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

  const handleScrollTo = (href: string) => {
    if (href === "#") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] flex h-16 items-center justify-between border-b border-white/10 bg-[#0f172a]/95 backdrop-blur-sm px-6">
      {/* Logo */}
      <a href="/#" className="flex-shrink-0" aria-label="首页">
        <img
          src={SHSMU_LOGO_URL}
          alt="上海交通大学医学院"
          className="h-8 w-auto object-contain object-left"
          style={{ filter: "brightness(0) invert(1)" }}
        />
      </a>

      {/* Navigation */}
      <nav className="hidden md:flex items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.href}
            type="button"
            onClick={() => handleScrollTo(item.href)}
            className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Right: Login / Enter Backend */}
      <div className="flex items-center gap-3">
        {hasToken ? (
          <button
            type="button"
            onClick={() => navigate(backgroundTarget || "/")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              "bg-[var(--app-color-accent-secondary,#d97706)] text-white hover:bg-[var(--app-color-accent,#c26905)]",
            )}
          >
            进入后台
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="rounded-full border border-white/25 px-4 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors"
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => navigate("/student/register")}
              className="rounded-full bg-white/90 px-4 py-1.5 text-sm font-medium text-[#0f172a] hover:bg-white transition-colors"
            >
              注册
            </button>
          </>
        )}
      </div>
    </header>
  );
}
