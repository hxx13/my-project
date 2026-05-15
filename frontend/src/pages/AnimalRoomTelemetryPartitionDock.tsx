import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronsRight, GripVertical, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_ANCHOR = "animalRoomTelemetryDockAnchor";
const STORAGE_MIN = "animalRoomTelemetryDockMin";
const MARGIN = 12;

export type AnimalRoomTelemetryPartitionDockItem = {
  key: string;
  /** 完整分区名（用于 title 提示） */
  label: string;
  /** 电梯按钮上展示的短名 */
  displayLabel: string;
  index: number;
};

type Corner = "bl" | "br" | "tl" | "tr";

/**
 * 电梯式分区浮层上的短标签（完整标题仍用按钮 `title`）。
 * B1F-E11A→A区、E11B/E111B→B区、E11C→C区、机房→机；B1F-E10→E10；其余保持原样。
 */
export function partitionDockElevatorDisplayLabel(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "—";
  if (s === "机房") return "机";
  if (/^机房\b/.test(s)) return "机";
  const u = s.toUpperCase();
  const compact = u.replace(/\s+/g, "").replace(/-/g, "");
  if (/E11C|B1FE11C|E_?11C/.test(compact) || /\bE-?\s*11\s*C\b/i.test(s)) return "C区";
  if (/E111B|E11B|B1FE11B|E_?11B/.test(compact) || /\bE-?\s*11\s*1?\s*B\b/i.test(s)) return "B区";
  if (/E11A|B1FE11A|E_?11A/.test(compact) || /\bE-?\s*11\s*A\b/i.test(s)) return "A区";
  if (/B1F[-_\s]?E10\b/i.test(s) || /^E10$/i.test(s.trim())) return "E10";
  return s;
}

function readCorner(): Corner {
  try {
    const v = (sessionStorage.getItem(STORAGE_ANCHOR) || "").trim().toLowerCase();
    if (v === "br" || v === "tl" || v === "tr" || v === "bl") return v;
  } catch {
    /* ignore */
  }
  return "bl";
}

function writeCorner(c: Corner) {
  try {
    sessionStorage.setItem(STORAGE_ANCHOR, c);
  } catch {
    /* ignore */
  }
}

function readMinimized(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_MIN) === "1";
  } catch {
    return false;
  }
}

function writeMinimized(m: boolean) {
  try {
    sessionStorage.setItem(STORAGE_MIN, m ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function cornerToPosition(corner: Corner, w: number, h: number): { left: number; top: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 600;
  const M = MARGIN;
  switch (corner) {
    case "bl":
      return { left: M, top: vh - h - M };
    case "br":
      return { left: vw - w - M, top: vh - h - M };
    case "tl":
      return { left: M, top: M };
    case "tr":
      return { left: vw - w - M, top: M };
    default:
      return { left: M, top: vh - h - M };
  }
}

function nearestCorner(left: number, top: number, w: number, h: number): Corner {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const M = MARGIN;
  const placements: { name: Corner; left: number; top: number }[] = [
    { name: "bl", left: M, top: vh - h - M },
    { name: "br", left: vw - w - M, top: vh - h - M },
    { name: "tl", left: M, top: M },
    { name: "tr", left: vw - w - M, top: M },
  ];
  const cx = left + w / 2;
  const cy = top + h / 2;
  let best: Corner = "bl";
  let bestD = Infinity;
  for (const p of placements) {
    const pcx = p.left + w / 2;
    const pcy = p.top + h / 2;
    const d = (cx - pcx) ** 2 + (cy - pcy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p.name;
    }
  }
  return best;
}

/**
 * 动物房温湿度：分区/楼层分页从顶栏移出，默认可拖拽、松手吸附四角、可最小化贴边（电梯式竖排胶囊按钮）。
 * 拖拽使用 window 级 pointer 监听，避免仅在按钮上监听时指针移出丢失 move/up。
 */
export function AnimalRoomTelemetryPartitionDock({
  scifi,
  items,
  activeIndex,
  onSelect,
}: {
  scifi: boolean;
  items: AnimalRoomTelemetryPartitionDockItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [minimized, setMinimized] = useState(readMinimized);
  const [corner, setCorner] = useState<Corner>(() => readCorner());
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const applyCorner = useCallback((c: Corner) => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = cornerToPosition(c, r.width, r.height);
    setPos(p);
  }, []);

  useLayoutEffect(() => {
    if (isDraggingRef.current) return;
    applyCorner(corner);
  }, [applyCorner, corner, minimized, items.length]);

  useEffect(() => {
    const onResize = () => {
      if (isDraggingRef.current) return;
      applyCorner(corner);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyCorner, corner]);

  const onPointerDownHandle = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const el = rootRef.current;
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const sess = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: r.left,
      origTop: r.top,
      w: r.width,
      h: r.height,
    };
    isDraggingRef.current = true;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== sess.pointerId) return;
      ev.preventDefault();
      const dx = ev.clientX - sess.startX;
      const dy = ev.clientY - sess.startY;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const M = MARGIN;
      let left = sess.origLeft + dx;
      let top = sess.origTop + dy;
      left = Math.max(M, Math.min(vw - sess.w - M, left));
      top = Math.max(M, Math.min(vh - sess.h - M, top));
      setPos({ left, top });
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== sess.pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      isDraggingRef.current = false;
      requestAnimationFrame(() => {
        const el2 = rootRef.current;
        if (!el2) return;
        const r2 = el2.getBoundingClientRect();
        const next = nearestCorner(r2.left, r2.top, r2.width, r2.height);
        setCorner(next);
        writeCorner(next);
        setPos(cornerToPosition(next, r2.width, r2.height));
      });
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, []);

  const toggleMin = useCallback(() => {
    setMinimized((m) => {
      const next = !m;
      writeMinimized(next);
      return next;
    });
  }, []);

  if (!items.length) return null;

  const shell = scifi
    ? "border-cyan-500/40 bg-slate-950/90 text-cyan-50 shadow-[0_0_32px_rgba(34,211,238,0.2)] ring-1 ring-cyan-400/30 backdrop-blur-md"
    : "border-zinc-200/95 bg-white/96 text-zinc-800 shadow-xl ring-1 ring-zinc-900/[0.07] backdrop-blur-md";

  const posStyle: CSSProperties =
    pos != null
      ? { position: "fixed", left: pos.left, top: pos.top, zIndex: 60, maxHeight: "min(72vh, 520px)" }
      : { position: "fixed", left: MARGIN, bottom: MARGIN, zIndex: 60, maxHeight: "min(72vh, 520px)" };

  if (minimized) {
    return (
      <div
        ref={rootRef}
        style={posStyle}
        className={cn("flex flex-col overflow-hidden rounded-full", shell, "w-11 touch-none")}
        role="navigation"
        aria-label="分区切换（已最小化）"
      >
        <button
          type="button"
          draggable={false}
          onPointerDown={onPointerDownHandle}
          className={cn(
            "flex h-10 cursor-grab select-none items-center justify-center border-b active:cursor-grabbing",
            scifi ? "border-cyan-500/25 bg-slate-900/85 text-cyan-200/90" : "border-zinc-200/70 bg-zinc-50/95 text-zinc-600"
          )}
          aria-label="拖拽移动分区栏"
        >
          <GripVertical className="h-4 w-4 shrink-0" aria-hidden />
        </button>
        <button
          type="button"
          onClick={toggleMin}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 rounded-b-full py-2 text-[10px] font-semibold leading-tight transition-colors",
            scifi ? "text-cyan-100/90 hover:bg-cyan-500/10" : "text-sky-800 hover:bg-sky-50"
          )}
          title="展开分区列表"
        >
          <Layers className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
          <span className="max-h-[4.5rem] overflow-hidden text-center [writing-mode:vertical-rl]">分区</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      style={posStyle}
      className={cn(
        "flex w-[min(8.5rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[2rem] touch-none",
        shell
      )}
      role="navigation"
      aria-label="分区电梯式切换"
    >
      <div
        className={cn(
          "flex items-center justify-center gap-1.5 px-2 pb-1.5 pt-2",
          scifi ? "bg-slate-900/80" : "bg-zinc-50/95"
        )}
      >
        <button
          type="button"
          draggable={false}
          onPointerDown={onPointerDownHandle}
          className={cn(
            "inline-flex h-9 min-w-[5.5rem] cursor-grab select-none items-center justify-center gap-1 rounded-full border px-3 text-[10px] font-medium active:cursor-grabbing",
            scifi
              ? "border-cyan-500/35 bg-slate-900/90 text-cyan-100/90 hover:bg-cyan-500/10"
              : "border-zinc-200/90 bg-white text-zinc-600 hover:bg-zinc-50"
          )}
          aria-label="拖拽整栏，松手吸附边角"
        >
          <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
          <span className="hidden min-[340px]:inline">拖动</span>
        </button>
        <button
          type="button"
          onClick={toggleMin}
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
            scifi
              ? "border-cyan-500/35 text-cyan-200/90 hover:bg-cyan-500/15"
              : "border-zinc-200/90 text-zinc-500 hover:bg-white"
          )}
          title="最小化到边缘"
          aria-label="最小化分区栏"
        >
          <ChevronsRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-stretch gap-1.5 overflow-y-auto overscroll-contain px-2 pb-2.5 pt-0.5">
        {items.map((it) => {
          const active = it.index === activeIndex;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onSelect(it.index)}
              className={cn(
                "flex min-h-[2.25rem] w-full items-center justify-center rounded-full border px-2 py-2 text-center text-xs font-semibold leading-tight transition-colors",
                active
                  ? scifi
                    ? "border-cyan-400/55 bg-gradient-to-b from-cyan-500/35 to-cyan-600/25 text-cyan-50 shadow-[0_0_16px_rgba(34,211,238,0.28)]"
                    : "border-sky-500/80 bg-gradient-to-b from-sky-500 to-sky-600 text-white shadow-md"
                  : scifi
                    ? "border-cyan-500/20 bg-slate-900/50 text-cyan-100/85 hover:border-cyan-400/40 hover:bg-slate-800/80"
                    : "border-zinc-200/80 bg-zinc-50/95 text-zinc-800 hover:border-sky-300/80 hover:bg-white"
              )}
              title={it.label}
            >
              <span className="max-w-full truncate">{it.displayLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
