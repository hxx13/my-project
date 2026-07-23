import { useEffect, useRef, useMemo } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/* ────────────────────────────────────────────
   ScrollReveal — word-by-word scroll reveal
   Based on React Bits <ScrollReveal />
   ──────────────────────────────────────────── */

export interface ScrollRevealProps {
  /** Text or React elements to animate. Strings are split into words. */
  children: React.ReactNode;
  /** Ref to the scroll container element (required for custom scroll containers). */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  /** Enable blur animation on words. */
  enableBlur?: boolean;
  /** Initial opacity before reveal (0–1). */
  baseOpacity?: number;
  /** Starting rotation in degrees for the container. */
  baseRotation?: number;
  /** Blur strength in pixels at animation start. */
  blurStrength?: number;
  /** Additional CSS class for the outer container. */
  containerClassName?: string;
  /** Additional CSS class for the text element. */
  textClassName?: string;
  /** ScrollTrigger end point for container rotation. */
  rotationEnd?: string;
  /** ScrollTrigger end point for word opacity/blur animations. */
  wordAnimationEnd?: string;
  /** HTML tag for the outer element. */
  tag?: 'h2' | 'h3' | 'p' | 'div';
}

const ScrollReveal = ({
  children,
  scrollContainerRef,
  enableBlur = true,
  baseOpacity = 0.1,
  baseRotation = 3,
  blurStrength = 4,
  containerClassName = '',
  textClassName = '',
  rotationEnd = 'bottom bottom',
  wordAnimationEnd = 'bottom bottom',
  tag = 'h2',
}: ScrollRevealProps) => {
  const containerRef = useRef<HTMLHeadingElement>(null);

  const splitText = useMemo(() => {
    const text = typeof children === 'string' ? children : '';
    if (!text) return null;
    return text.split(/(\s+)/).map((word, index) => {
      if (word.match(/^\s+$/)) return word;
      return (
        <span className="word" key={index}>
          {word}
        </span>
      );
    });
  }, [children]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scroller =
      scrollContainerRef && scrollContainerRef.current
        ? scrollContainerRef.current
        : window;

    gsap.fromTo(
      el,
      { transformOrigin: '0% 50%', rotate: baseRotation },
      {
        ease: 'none',
        rotate: 0,
        scrollTrigger: {
          trigger: el,
          scroller,
          start: 'top bottom',
          end: rotationEnd,
          scrub: true,
        },
      },
    );

    const wordElements = el.querySelectorAll('.word');
    if (!wordElements.length) return;

    gsap.fromTo(
      wordElements,
      { opacity: baseOpacity, willChange: 'opacity' },
      {
        ease: 'none',
        opacity: 1,
        stagger: 0.05,
        scrollTrigger: {
          trigger: el,
          scroller,
          start: 'top bottom-=20%',
          end: wordAnimationEnd,
          scrub: true,
        },
      },
    );

    if (enableBlur) {
      gsap.fromTo(
        wordElements,
        { filter: `blur(${blurStrength}px)` },
        {
          ease: 'none',
          filter: 'blur(0px)',
          stagger: 0.05,
          scrollTrigger: {
            trigger: el,
            scroller,
            start: 'top bottom-=20%',
            end: wordAnimationEnd,
            scrub: true,
          },
        },
      );
    }

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, [
    scrollContainerRef,
    enableBlur,
    baseRotation,
    baseOpacity,
    rotationEnd,
    wordAnimationEnd,
    blurStrength,
  ]);

  const Tag = tag;

  return (
    <Tag ref={containerRef} className={`scroll-reveal ${containerClassName}`}>
      {typeof children === 'string' ? (
        <span className={`scroll-reveal-text ${textClassName}`}>{splitText}</span>
      ) : (
        children
      )}
    </Tag>
  );
};

export default ScrollReveal;
