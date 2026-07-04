import { type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger);

export type OpsSceneRevealVariant = "fade-up" | "fade-down" | "fade-left" | "fade-only";

const VARIANTS: Record<
  OpsSceneRevealVariant,
  { from: gsap.TweenVars; to: gsap.TweenVars; duration: number; ease: string }
> = {
  "fade-up": { from: { opacity: 0, y: 28 }, to: { opacity: 1, y: 0 }, duration: 0.75, ease: "power2.out" },
  "fade-down": { from: { opacity: 0, y: -18 }, to: { opacity: 1, y: 0 }, duration: 0.65, ease: "power3.out" },
  "fade-left": { from: { opacity: 0, x: -22 }, to: { opacity: 1, x: 0 }, duration: 0.7, ease: "power2.out" },
  "fade-only": { from: { opacity: 0 }, to: { opacity: 1 }, duration: 0.55, ease: "power1.out" },
};

/** Scroll-triggered section label reveal; each scene picks a variant to avoid identical motion. */
export function useOpsSceneReveal(
  sectionRef: RefObject<HTMLElement | null>,
  headerRef: RefObject<HTMLElement | null>,
  reducedMotion: boolean,
  variant: OpsSceneRevealVariant,
  deps: unknown[] = [],
) {
  useGSAP(
    () => {
      const section = sectionRef.current;
      const header = headerRef.current;
      if (!section || !header || reducedMotion) return;

      const cfg = VARIANTS[variant];
      const tween = gsap.fromTo(header, cfg.from, {
        ...cfg.to,
        duration: cfg.duration,
        ease: cfg.ease,
        scrollTrigger: {
          trigger: section,
          start: "top 78%",
          toggleActions: "play none none reverse",
        },
      });

      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    },
    { scope: sectionRef, dependencies: [reducedMotion, variant, ...deps] },
  );
}
