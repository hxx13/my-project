import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { usePrefersReducedMotion } from '@/hooks/useTypewriterText';

gsap.registerPlugin(ScrollTrigger);

/* ────────────────────────────────────────────
   FadeInSection — section-level scroll reveal
   Fade-up linked to scroll position via scrub.
   Animation is guaranteed to complete before
   the section center reaches viewport center.
   Header ~64px baked into start offset.
   ──────────────────────────────────────────── */

export interface FadeInSectionProps {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}

/** Header height in px, baked into the start offset */
const HEADER_H = 64;

export function FadeInSection({
  children,
  className,
  as: element = 'div',
}: FadeInSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (!ref.current || reducedMotion) return;

      gsap.fromTo(
        ref.current,
        { opacity: 0, y: 48 },
        {
          opacity: 1,
          y: 0,
          ease: 'power1.inOut',
          scrollTrigger: {
            trigger: ref.current,
            start: `top bottom-=${80 + HEADER_H}px`,
            end: 'top 52%',
            scrub: true,
          },
        },
      );
    },
    { scope: ref, dependencies: [reducedMotion] },
  );

  // TS cannot resolve the intersection of all possible ElementType props,
  // so we cast to any for the JSX tag — the runtime behaviour is sound.
  const Tag = element as any;

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
