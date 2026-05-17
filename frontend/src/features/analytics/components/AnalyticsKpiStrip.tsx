import { cn } from "@/lib/utils";

export type KpiItem = {
  label: string;
  value: string | number;
  hint?: string;
  tint?: "lavender" | "mint" | "peach" | "sky" | "rose";
};

const TINT: Record<NonNullable<KpiItem["tint"]>, string> = {
  lavender: "border-violet-200/80 bg-gradient-to-br from-violet-50 to-indigo-50/80 text-violet-950",
  mint: "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50/70 text-emerald-950",
  peach: "border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/70 text-amber-950",
  sky: "border-sky-200/80 bg-gradient-to-br from-sky-50 to-cyan-50/70 text-sky-950",
  rose: "border-rose-200/80 bg-gradient-to-br from-rose-50 to-pink-50/70 text-rose-950",
};

export function AnalyticsKpiStrip({ items, className }: { items: KpiItem[]; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {items.map((it) => (
        <div
          key={it.label}
          className={cn(
            "rounded-2xl border px-4 py-3.5 shadow-sm ring-1 ring-black/[0.02] transition hover:shadow-md",
            TINT[it.tint ?? "lavender"]
          )}
        >
          <p className="text-xs font-medium opacity-80">{it.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{it.value}</p>
          {it.hint ? <p className="mt-0.5 text-[11px] opacity-70">{it.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
