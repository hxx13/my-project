import { useState, useEffect, useMemo, useRef } from "react";
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from "motion/react";
import { fetchLoginBranding, pickLoginHeroUrls, type LoginBranding } from "@/api/domains/publicSite.api";
import { useTheme } from "@/features/theme/ThemeProvider";

/**
 * Hero images sink from full-screen into background as user scrolls down.
 * Images auto-rotate, and the sinking image is replaced by the next in the carousel.
 */
export function PortalParallax({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const effectiveMode = theme.mode === "dark" ? "dark" : "light";
  const [branding, setBranding] = useState<LoginBranding | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("aro_login_branding_v1");
      if (cached) setBranding(JSON.parse(cached));
    } catch {}
    fetchLoginBranding().then((b) => {
      setBranding(b);
      try { sessionStorage.setItem("aro_login_branding_v1", JSON.stringify(b)); } catch {}
    }).catch(() => {});
  }, []);

  const heroUrls = useMemo(() => pickLoginHeroUrls(branding, effectiveMode), [branding, effectiveMode]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState(0);

  // Auto-rotate: slide horizontally
  useEffect(() => {
    if (heroUrls.length <= 1) return;
    const interval = Math.max(4, branding?.intervalSec ?? 8);
    const timer = setInterval(() => {
      setPrevIdx(activeIdx);
      setActiveIdx(i => (i + 1) % heroUrls.length);
    }, interval * 1000);
    return () => clearInterval(timer);
  }, [heroUrls.length, branding?.intervalSec, activeIdx]);

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end end"] });
  const springConfig = { stiffness: 250, damping: 35, bounce: 0 };

  // On scroll: images sink into background
  const sinkY = useSpring(useTransform(scrollYProgress, [0, 0.35], [0, 500]), springConfig);
  const sinkOpacity = useSpring(useTransform(scrollYProgress, [0, 0.3], [1, 0.08]), springConfig);

  if (heroUrls.length === 0) return <>{children}</>;

  const dir = activeIdx > prevIdx || (activeIdx === 0 && prevIdx === heroUrls.length - 1) ? 1 : -1;

  return (
    <div ref={containerRef} className="relative">
      {/* Fixed background — horizontally scrolling full-screen images */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <motion.div style={{ y: sinkY, opacity: sinkOpacity }} className="absolute inset-0">
          {heroUrls.map((url, i) => {
            const isActive = i === activeIdx;
            const isPrev = i === prevIdx;
            let x = "100%";
            if (isActive) x = "0%";
            else if (isPrev) x = dir === 1 ? "-100%" : "100%";
            return (
              <motion.img
                key={url}
                src={url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                animate={{ x: isActive ? "0%" : isPrev ? (dir === 1 ? "-100%" : "100%") : dir === 1 ? "100%" : "-100%" }}
                initial={false}
                transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
              />
            );
          })}
        </motion.div>
      </div>

      {/* Content scrolls on top */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
