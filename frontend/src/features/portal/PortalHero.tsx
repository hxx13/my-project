import { useState, useEffect, useMemo } from "react";
import { fetchLoginBranding, pickLoginHeroUrls, type LoginBranding } from "@/api/domains/publicSite.api";
import { useTheme } from "@/features/theme/ThemeProvider";
import { cn } from "@/lib/utils";

const FALLBACK_BG = "#0f172a";

interface PortalHeroProps {
  className?: string;
  height?: string;
}

export function PortalHero({ className, height = "calc(100vh - 64px)" }: PortalHeroProps) {
  const { theme } = useTheme();
  const effectiveMode = theme.mode === "dark" ? "dark" : "light";
  const [branding, setBranding] = useState<LoginBranding | null>(null);
  const [heroIdx, setHeroIdx] = useState(0);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("aro_login_branding_v1");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.heroImageUrls?.length || parsed?.heroImageUrlsLight?.length) {
          setBranding(parsed as LoginBranding);
        }
      }
    } catch {}
    fetchLoginBranding()
      .then((b) => {
        setBranding(b);
        try { sessionStorage.setItem("aro_login_branding_v1", JSON.stringify(b)); } catch {}
      })
      .catch(() => {});
  }, []);

  const heroUrls = useMemo(
    () => pickLoginHeroUrls(branding, effectiveMode),
    [branding, effectiveMode],
  );
  const heroUrlKey = useMemo(() => heroUrls.join("\0"), [heroUrls]);

  useEffect(() => { setHeroIdx(0); }, [effectiveMode, heroUrlKey]);

  const heroCarouselOn = branding?.heroCarouselEnabled !== false && heroUrls.length > 0;

  useEffect(() => {
    if (!heroCarouselOn || heroUrls.length <= 1) return;
    const sec = Math.max(3, branding?.intervalSec ?? 8);
    const timer = setInterval(() => {
      setHeroIdx((i) => (i + 1) % heroUrls.length);
    }, sec * 1000);
    return () => clearInterval(timer);
  }, [heroCarouselOn, heroUrlKey, heroUrls.length, branding?.intervalSec]);

  return (
    <section
      className={cn("relative overflow-hidden", className)}
      style={{ height, backgroundColor: heroCarouselOn ? "transparent" : FALLBACK_BG }}
    >
      {heroCarouselOn && heroUrls.map((url, i) => (
        <img
          key={url}
          src={url}
          alt=""
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-1000",
            i === heroIdx ? "opacity-100" : "opacity-0",
          )}
        />
      ))}

      {/* Scroll indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70 animate-bounce">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
        <span className="text-xs text-white/50 tracking-[0.2em]">向下滚动</span>
      </div>
    </section>
  );
}
