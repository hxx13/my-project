import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { usePrefersReducedMotion } from '@/hooks/useTypewriterText';

gsap.registerPlugin(ScrollTrigger);

/* ────────────────────────────────────────────
   StaggerCards — staggered left/right card reveal
   Even indices slide in from left, odd from right.
   Scrub-linked to scroll position.
   ──────────────────────────────────────────── */

export interface StaggerCardsProps {
  children: React.ReactNode;
  className?: string;
  /** Horizontal offset in px */
  offset?: number;
}

export function StaggerCards({
  children,
  className,
  offset = 60,
}: StaggerCardsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      const container = containerRef.current;
      if (!container || reducedMotion) return;

      const cards = Array.from(container.children) as HTMLElement[];

      const triggers = cards.map((card, i) => {
        const fromLeft = i % 2 === 0;
        return gsap.fromTo(
          card,
          { opacity: 0, x: fromLeft ? -offset : offset },
          {
            opacity: 1,
            x: 0,
            ease: 'power1.inOut',
            scrollTrigger: {
              trigger: card,
              start: 'top bottom+=30%',
              end: 'top 56%',
              scrub: true,
            },
          },
        );
      });

      return () => {
        triggers.forEach((t) => {
          t.scrollTrigger?.kill();
          t.kill();
        });
      };
    },
    { scope: containerRef, dependencies: [reducedMotion, offset] },
  );

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
