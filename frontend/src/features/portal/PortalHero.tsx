import { useState, useEffect, useMemo } from "react";
import { fetchLoginBranding, pickLoginHeroUrls, type LoginBranding } from "@/api/domains/publicSite.api";
import { useTheme } from "@/features/theme/ThemeProvider";
import { cn } from "@/lib/utils";

const FALLBACK_BG = "#0f172a";

interface PortalHeroProps {
  className?: string;
  height?: string;
}

export function PortalHero({ className, height = "520px" }: PortalHeroProps) {
  const { theme } = useTheme();
  const effectiveMode = theme.mode === "dark" ? "dark" : "light";
  const [branding, setBranding] = useState<LoginBranding | null>(null);
  const [heroIdx, setHeroIdx] = useState(0);

  // Restore from cache
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("aro_login_branding_v1");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.heroImageUrls?.length || parsed?.heroImageUrlsLight?.length) {
          setBranding(parsed as LoginBranding);
        }
      }
    } catch { /* ignore */ }
    fetchLoginBranding()
      .then((b) => {
        setBranding(b);
        try { sessionStorage.setItem("aro_login_branding_v1", JSON.stringify(b)); } catch { /* ignore */ }
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

  // Auto-rotate
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
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50" />
    </section>
  );
}
