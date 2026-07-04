import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Smart-scroll snap hook.
 *
 * - Free scroll by default (no CSS scroll-snap).
 * - When the user flicks fast enough AND lands within a threshold of a section
 *   boundary, the scroll animates to the nearest section.
 *
 * @param sectionCount  number of full-viewport sections
 * @param velocityThreshold  px/ms above which a flick is considered "fast" (default 0.4)
 * @param snapThreshold  fraction of viewport height for boundary proximity (default 0.25)
 * @param snapDuration  ms for the snap animation (default 350)
 */

export interface ScrollSnapState {
  /** 0-based index of the section closest to the viewport center */
  activeSection: number;
  /** 0–1 progress within the active section (0 = top of section, 1 = bottom) */
  sectionProgress: number;
  /** Raw scrollTop of the container */
  scrollTop: number;
  /** Total scrollable height */
  scrollHeight: number;
  /** Viewport height of the scroll container */
  viewHeight: number;
  /** Whether a snap animation is currently in progress */
  isSnapping: boolean;
}

export function useScrollSnap(
  sectionCount: number,
  velocityThreshold = 0.4,
  snapThreshold = 0.25,
  snapDuration = 350,
) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const snapAnimRef = useRef<{ start: number; from: number; to: number } | null>(null);
  const lastScrollTopRef = useRef(0);
  const lastScrollTimeRef = useRef(0);
  const velocityRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSnappingRef = useRef(false);

  const [state, setState] = useState<ScrollSnapState>({
    activeSection: 0,
    sectionProgress: 0,
    scrollTop: 0,
    scrollHeight: 0,
    viewHeight: 0,
    isSnapping: false,
  });

  const updateState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const viewHeight = el.clientHeight;
    const sectionHeight = viewHeight;
    const scrollTop = el.scrollTop;
    const scrollHeight = el.scrollHeight;
    const rawIndex = scrollTop / sectionHeight;
    const activeSection = Math.max(0, Math.min(sectionCount - 1, Math.round(rawIndex)));
    const sectionStart = activeSection * sectionHeight;
    const sectionProgress = Math.max(0, Math.min(1, (scrollTop - sectionStart) / sectionHeight));

    setState({
      activeSection,
      sectionProgress,
      scrollTop,
      scrollHeight,
      viewHeight,
      isSnapping: isSnappingRef.current,
    });
  }, [sectionCount]);

  /* ── Snap animation loop ── */
  const animateSnap = useCallback((timestamp: number) => {
    const anim = snapAnimRef.current;
    const el = scrollRef.current;
    if (!anim || !el) {
      snapAnimRef.current = null;
      isSnappingRef.current = false;
      updateState();
      return;
    }
    const elapsed = timestamp - anim.start;
    const progress = Math.min(1, elapsed / snapDuration);
    // ease-out-quint
    const eased = 1 - Math.pow(1 - progress, 5);
    el.scrollTop = anim.from + (anim.to - anim.from) * eased;
    updateState();

    if (progress < 1) {
      rafRef.current = requestAnimationFrame(animateSnap);
    } else {
      el.scrollTop = anim.to;
      snapAnimRef.current = null;
      isSnappingRef.current = false;
      updateState();
    }
  }, [snapDuration, updateState]);

  /* ── Evaluate snap on scroll stop ── */
  const evaluateSnap = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isSnappingRef.current) return;
    const viewHeight = el.clientHeight;
    const currentScrollTop = el.scrollTop;
    const velocity = velocityRef.current;

    // Only snap if flick was fast enough
    if (Math.abs(velocity) < velocityThreshold) return;

    const nearestSection = Math.round(currentScrollTop / viewHeight);
    const nearestBoundary = nearestSection * viewHeight;
    const distance = Math.abs(currentScrollTop - nearestBoundary);

    // Only snap if close enough to a boundary
    if (distance > viewHeight * snapThreshold) return;

    // Clamp to valid range
    const clamped = Math.max(0, Math.min(sectionCount - 1, nearestSection));
    const target = clamped * viewHeight;

    if (Math.abs(target - currentScrollTop) < 1) return;

    isSnappingRef.current = true;
    snapAnimRef.current = { start: performance.now(), from: currentScrollTop, to: target };
    rafRef.current = requestAnimationFrame(animateSnap);
  }, [velocityThreshold, snapThreshold, sectionCount, animateSnap]);

  /* ── Scroll handler ── */
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const now = performance.now();
    const st = el.scrollTop;
    const dt = now - lastScrollTimeRef.current;
    if (dt > 0) {
      velocityRef.current = (st - lastScrollTopRef.current) / dt;
    }
    lastScrollTopRef.current = st;
    lastScrollTimeRef.current = now;

    updateState();

    // Debounce the snap evaluation
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      evaluateSnap();
    }, 120); // 120ms after last scroll event
  }, [updateState, evaluateSnap]);

  /* ── Bind ref ── */
  const bindScroll = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el;
      if (el) {
        el.addEventListener('scroll', onScroll, { passive: true });
        // Initial state
        requestAnimationFrame(updateState);
      }
    },
    [onScroll, updateState],
  );

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { bindScroll, ...state };
}
