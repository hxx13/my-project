import { cn } from "@/lib/utils";

export type AnimalRoomTelemetryPartitionDockItem = {
  key: string;
  /** 完整分区名（用于 title 提示） */
  label: string;
  /** 电梯按钮上展示的短名 */
  displayLabel: string;
  index: number;
};

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

/**
 * 动物房温湿度：分区/楼层切换 — 顶栏中区横向胶囊按钮（窄屏区内横滑）。
 */
export function AnimalRoomTelemetryPartitionHeaderNav({
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
  if (!items.length) return null;

  return (
    <nav
      role="navigation"
      aria-label="分区切换"
      data-animal-telemetry-scroll="tabs"
      className={cn(
        "flex min-h-0 min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden py-0.5",
        "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:[scrollbar-width:thin]"
      )}
    >
      {items.map((it) => {
        const active = it.index === activeIndex;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onSelect(it.index)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-center text-[10px] font-semibold leading-tight transition-colors motion-reduce:transition-none sm:px-3 sm:py-1.5 sm:text-[11px]",
              active
                ? scifi
                  ? "border-cyan-400/55 bg-gradient-to-b from-cyan-500/35 to-cyan-600/25 text-cyan-50 shadow-[0_0_12px_rgba(34,211,238,0.22)]"
                  : "border-sky-500/80 bg-gradient-to-b from-sky-500 to-sky-600 text-white shadow-md"
                : scifi
                  ? "border-cyan-500/20 bg-slate-900/50 text-cyan-100/85 hover:border-cyan-400/40 hover:bg-slate-800/80"
                  : "border-zinc-200/80 bg-zinc-50/95 text-zinc-800 hover:border-sky-300/80 hover:bg-white"
            )}
            title={it.label}
            aria-current={active ? "page" : undefined}
          >
            <span className="whitespace-nowrap">{it.displayLabel}</span>
          </button>
        );
      })}
    </nav>
  );
}
