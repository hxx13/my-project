import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';

/* ────────────────────────────────────────────
   DecryptedText — scramble-reveal animation
   Based on React Bits <DecryptedText />
   ──────────────────────────────────────────── */

export interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  sequential?: boolean;
  revealDirection?: 'start' | 'end' | 'center';
  useOriginalCharsOnly?: boolean;
  characters?: string;
  className?: string;
  parentClassName?: string;
  encryptedClassName?: string;
  animateOn?: 'view' | 'hover' | 'click';
  clickMode?: 'once' | 'toggle';
  rootRef?: React.RefObject<HTMLElement | null>;
}

const DEFAULT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+';

export default function DecryptedText({
  text,
  speed = 50,
  maxIterations = 10,
  sequential = false,
  revealDirection = 'start',
  useOriginalCharsOnly = false,
  characters = DEFAULT_CHARS,
  className = '',
  parentClassName = '',
  encryptedClassName = '',
  animateOn = 'view',
  clickMode = 'once',
  rootRef,
  ...props
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isAnimating, setIsAnimating] = useState(false);
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());
  const [hasAnimated, setHasAnimated] = useState(false);
  const [isDecrypted, setIsDecrypted] = useState(animateOn !== 'click');
  const containerRef = useRef<HTMLSpanElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const availableChars = useMemo(() => {
    return useOriginalCharsOnly
      ? Array.from(new Set(text.split(''))).filter((char) => char !== ' ')
      : characters.split('');
  }, [useOriginalCharsOnly, text, characters]);

  const shuffleText = useCallback(
    (originalText: string, currentRevealed: Set<number>) =>
      originalText
        .split('')
        .map((char, i) => {
          if (char === ' ') return ' ';
          if (currentRevealed.has(i)) return originalText[i];
          return availableChars[Math.floor(Math.random() * availableChars.length)];
        })
        .join(''),
    [availableChars],
  );

  const triggerDecrypt = useCallback(() => {
    setRevealedIndices(new Set());
    setIsAnimating(true);
  }, []);

  /* ── View observer ── */
  useEffect(() => {
    if (animateOn !== 'view') return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          triggerDecrypt();
          setHasAnimated(true);
        }
      },
      { threshold: 0.1, root: rootRef?.current ?? null },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [animateOn, hasAnimated, triggerDecrypt, rootRef]);

  /* ── Hover ── */
  const hoverProps =
    animateOn === 'hover'
      ? {
          onMouseEnter: () => {
            if (isAnimating) return;
            setRevealedIndices(new Set());
            setIsDecrypted(false);
            setDisplayText(text);
            setIsAnimating(true);
          },
          onMouseLeave: () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setIsAnimating(false);
            setRevealedIndices(new Set());
            setDisplayText(text);
            setIsDecrypted(true);
          },
        }
      : {};

  /* ── Click ── */
  const clickProps =
    animateOn === 'click'
      ? {
          onClick: () => {
            if (clickMode === 'once' && isDecrypted) return;
            if (isDecrypted) {
              setIsDecrypted(false);
              triggerDecrypt();
            } else {
              triggerDecrypt();
            }
          },
        }
      : {};

  /* ── Animation loop ── */
  useEffect(() => {
    if (!isAnimating) return;
    let iter = 0;

    intervalRef.current = setInterval(() => {
      if (!sequential) {
        setDisplayText((prev) => {
          iter++;
          if (iter >= maxIterations) {
            clearInterval(intervalRef.current!);
            setIsAnimating(false);
            setIsDecrypted(true);
            return text;
          }
          return shuffleText(text, new Set());
        });
      } else {
        setRevealedIndices((prev) => {
          if (prev.size >= text.length) {
            clearInterval(intervalRef.current!);
            setIsAnimating(false);
            setIsDecrypted(true);
            return prev;
          }
          let nextIdx: number;
          const len = text.length;
          if (revealDirection === 'start') nextIdx = prev.size;
          else if (revealDirection === 'end') nextIdx = len - 1 - prev.size;
          else {
            const mid = Math.floor(len / 2);
            const off = Math.floor(prev.size / 2);
            nextIdx = prev.size % 2 === 0 ? mid + off : mid - off - 1;
            if (nextIdx < 0 || nextIdx >= len || prev.has(nextIdx)) {
              for (let i = 0; i < len; i++) if (!prev.has(i)) { nextIdx = i; break; }
            }
          }
          const next = new Set(prev);
          next.add(nextIdx);
          setDisplayText(shuffleText(text, next));
          return next;
        });
      }
    }, speed);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isAnimating, text, speed, maxIterations, sequential, revealDirection, shuffleText]);

  return (
    <motion.span
      ref={containerRef}
      className={parentClassName}
      style={{ display: 'inline-block', whiteSpace: 'pre-wrap' }}
      {...hoverProps}
      {...clickProps}
      {...props}
    >
      <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }}>
        {displayText}
      </span>
      <span aria-hidden="true">
        {displayText.split('').map((char, i) => {
          const revealed = revealedIndices.has(i) || (!isAnimating && isDecrypted);
          return (
            <span key={i} className={revealed ? className : encryptedClassName}>
              {char}
            </span>
          );
        })}
      </span>
    </motion.span>
  );
}
