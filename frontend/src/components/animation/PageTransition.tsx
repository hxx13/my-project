import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

interface PageTransitionProps {
  children: React.ReactNode;
  /** 'fadeUp' | 'fadeIn' | 'slideLeft' | 'none' */
  variant?: "fadeUp" | "fadeIn" | "slideLeft" | "none";
  duration?: number;
  delay?: number;
  className?: string;
}

/**
 * Wraps page content with a GSAP entrance animation.
 * Use inside each page or as an Outlet wrapper for route-level transitions.
 */
export function PageTransition({
  children,
  variant = "fadeUp",
  duration = 0.35,
  delay = 0,
  className,
}: PageTransitionProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!containerRef.current || variant === "none") return;
      const el = containerRef.current;
      gsap.set(el, { willChange: "transform, opacity" });
      if (variant === "fadeUp") {
        gsap.fromTo(el, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration, delay, ease: "power2.out", clearProps: "willChange" });
      } else if (variant === "fadeIn") {
        gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration, delay, ease: "power2.out", clearProps: "willChange" });
      } else if (variant === "slideLeft") {
        gsap.fromTo(el, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration, delay, ease: "power2.out", clearProps: "willChange" });
      }
    },
    { scope: containerRef },
  );

  return <div ref={containerRef} className={className}>{children}</div>;
}

/**
 * Staggered list entrance — each direct child gets animated in sequence.
 * Usage: <StaggerList stagger={0.06}>{items.map(i => <div key={i.id} className="stagger-item">...)</div>)}</StaggerList>
 */
export function StaggerList({
  children,
  stagger = 0.06,
  duration = 0.4,
  fromY = 20,
  ease = "power3.out",
}: {
  children: React.ReactNode;
  stagger?: number;
  duration?: number;
  fromY?: number;
  ease?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!containerRef.current) return;
      gsap.fromTo(
        containerRef.current.querySelectorAll(".stagger-item"),
        { opacity: 0, y: fromY },
        { opacity: 1, y: 0, duration, stagger, ease, clearProps: "transform,opacity" },
      );
    },
    { scope: containerRef, dependencies: [children] },
  );

  return <div ref={containerRef}>{children}</div>;
}
