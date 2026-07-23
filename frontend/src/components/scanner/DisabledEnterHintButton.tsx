import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Z_INDEX } from "@/constants/zIndex";

interface DisabledEnterHintButtonProps {
  hintText: string;
}

const GAP = 8;
const BUBBLE_W = 300;
const BUBBLE_H_EST = 200;
const VIEWPORT_PAD = 12;

type ArrowEdge = "left" | "top";

interface BubbleLayout {
  left: number;
  top: number;
  arrowEdge: ArrowEdge;
  arrowOffset: number; // px from bubble edge origin to arrow center
}

export const DisabledEnterHintButton = ({ hintText }: DisabledEnterHintButtonProps) => {
  const [open, setOpen] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const [typingDone, setTypingDone] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [layout, setLayout] = useState<BubbleLayout>({
    left: 0, top: 0, arrowEdge: "left", arrowOffset: 20,
  });

  // ──── Typewriter ────
  useEffect(() => {
    if (open) {
      setDisplayedText("");
      setTypingDone(false);
      let i = 0;
      const chars = [...hintText];
      typewriterRef.current = setInterval(() => {
        i++;
        if (i <= chars.length) {
          setDisplayedText(chars.slice(0, i).join(""));
        } else {
          if (typewriterRef.current) clearInterval(typewriterRef.current);
          setTypingDone(true);
        }
      }, 35);
    } else {
      setDisplayedText("");
      setTypingDone(false);
      if (typewriterRef.current) clearInterval(typewriterRef.current);
    }
    return () => {
      if (typewriterRef.current) clearInterval(typewriterRef.current);
    };
  }, [open, hintText]);

  // ──── Layout: default bottom-right of button, edge-detect auto-flip ────
  const computeLayout = useCallback((): BubbleLayout => {
    if (!buttonRef.current) {
      return { left: 0, top: 0, arrowEdge: "left", arrowOffset: 20 };
    }
    const r = buttonRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const btnCY = r.top + r.height / 2;

    // Default: right of button, top-aligned; arrow on left edge of bubble
    let left = r.right + GAP;
    let top = r.top;
    let arrowEdge: ArrowEdge = "left";
    let arrowOffset = btnCY - top;

    // H-flip: if bubble overflows right edge, place left of button; arrow on top edge
    if (left + BUBBLE_W > vw - VIEWPORT_PAD) {
      left = r.left - BUBBLE_W - GAP;
      // bubble now to the left of button → arrow on right side makes more sense,
      // but for the arrow to point directly at the button, use top-edge arrow
      // pointing up toward the button
      arrowEdge = "top";
      arrowOffset = r.left + r.width / 2 - left;
    }

    // V-flip: if bubble overflows bottom, align bubble bottom with button bottom
    if (top + BUBBLE_H_EST > vh - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, r.bottom - BUBBLE_H_EST);
      arrowOffset = arrowEdge === "left" ? btnCY - top : arrowOffset;
    }

    // Clamp to viewport
    left = Math.max(VIEWPORT_PAD, Math.min(left, vw - BUBBLE_W - VIEWPORT_PAD));
    top = Math.max(VIEWPORT_PAD, top);

    // Recalc arrow offset after clamping
    if (arrowEdge === "left") {
      arrowOffset = Math.max(16, Math.min(BUBBLE_H_EST - 16, btnCY - top));
    } else {
      arrowOffset = Math.max(16, Math.min(BUBBLE_W - 16, r.left + r.width / 2 - left));
    }

    return { left, top, arrowEdge, arrowOffset };
  }, []);

  useEffect(() => {
    if (!open) return;
    setLayout(computeLayout());
    const onMove = () => setLayout(computeLayout());
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, computeLayout]);

  // ──── Click outside to close ────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (bubbleRef.current?.contains(target)) return;
      setOpen(false);
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  // ──── Jello animation on click ────
  const [jello, setJello] = useState(false);
  const handleClick = () => {
    setJello(true);
    setTimeout(() => setJello(false), 900);
    setOpen((prev) => !prev);
  };

  // ──── Arrow: CSS triangle on bubble edge pointing toward button ────
  const renderArrow = (edge: ArrowEdge, offset: number) => {
    const SIZE = 8;
    const SIZE_INNER = 7;
    const base: React.CSSProperties = {
      position: "absolute",
      width: 0,
      height: 0,
    };

    if (edge === "left") {
      // Arrow on LEFT edge, pointing LEFT (toward button on bubble's left)
      return (
        <>
          <div style={{ ...base, left: -SIZE, top: offset, transform: "translateY(-50%)", borderTop: `${SIZE}px solid transparent`, borderBottom: `${SIZE}px solid transparent`, borderRight: `${SIZE}px solid var(--app-color-border-default)` }} />
          <div style={{ ...base, left: -(SIZE_INNER - 1), top: offset, transform: "translateY(-50%)", borderTop: `${SIZE_INNER}px solid transparent`, borderBottom: `${SIZE_INNER}px solid transparent`, borderRight: `${SIZE_INNER}px solid var(--app-color-surface-elevated)` }} />
        </>
      );
    }
    // Arrow on TOP edge, pointing UP (toward button above bubble)
    return (
      <>
        <div style={{ ...base, left: offset, top: -SIZE, transform: "translateX(-50%)", borderLeft: `${SIZE}px solid transparent`, borderRight: `${SIZE}px solid transparent`, borderBottom: `${SIZE}px solid var(--app-color-border-default)` }} />
        <div style={{ ...base, left: offset, top: -(SIZE_INNER - 1), transform: "translateX(-50%)", borderLeft: `${SIZE_INNER}px solid transparent`, borderRight: `${SIZE_INNER}px solid transparent`, borderBottom: `${SIZE_INNER}px solid var(--app-color-surface-elevated)` }} />
      </>
    );
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center cursor-pointer border-0 shrink-0 transition-colors"
        style={{
          background: "var(--app-color-accent, #d97706)",
          color: "#fff",
          animation: jello ? "jello-vertical 0.9s both" : "none",
        }}
        onClick={handleClick}
        aria-label="查看禁入原因帮助"
        title="为什么不能进入？"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={bubbleRef}
              key="hint-bubble"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed"
              style={{
                zIndex: Z_INDEX.scannerHintBubble,
                top: layout.top,
                left: layout.left,
                width: BUBBLE_W,
                maxWidth: `calc(100vw - ${VIEWPORT_PAD * 2}px)`,
              }}
            >
              <div className="rounded-2xl bg-[var(--app-color-surface-elevated)] border border-[var(--app-color-border-default)] shadow-[var(--app-elevation-modal)] p-4">
                {renderArrow(layout.arrowEdge, layout.arrowOffset)}

                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-sm">💡</span>
                  <span className="text-xs font-bold text-[var(--app-color-text-primary)]">
                    禁入原因说明
                  </span>
                </div>

                <p className="text-xs leading-relaxed text-[var(--app-color-text-secondary)] whitespace-pre-wrap min-h-[2em]">
                  {displayedText}
                  {!typingDone && (
                    <span className="inline-block w-[1px] h-[1em] bg-[var(--app-color-accent)] ml-0.5 align-text-bottom animate-pulse" />
                  )}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
};

/* ═══════════ Jello keyframes ═══════════ */
const styleEl = document.createElement("style");
styleEl.textContent = `
@keyframes jello-vertical {
  0%   { transform: scale3d(1, 1, 1); }
  30%  { transform: scale3d(0.75, 1.25, 1); }
  40%  { transform: scale3d(1.25, 0.75, 1); }
  50%  { transform: scale3d(0.85, 1.15, 1); }
  65%  { transform: scale3d(1.05, 0.95, 1); }
  75%  { transform: scale3d(0.95, 1.05, 1); }
  100% { transform: scale3d(1, 1, 1); }
}
`;
if (!document.head.querySelector("[data-hint-jello]")) {
  styleEl.setAttribute("data-hint-jello", "1");
  document.head.appendChild(styleEl);
}
