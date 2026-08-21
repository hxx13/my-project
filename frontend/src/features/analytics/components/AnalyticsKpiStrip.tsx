import { cn } from "@/lib/utils";

export type KpiItem = {
  label: string;
  value: string | number;
  hint?: string;
  tint?: "lavender" | "mint" | "peach" | "sky" | "rose";
};

const TINT: Record<NonNullable<KpiItem["tint"]>, string> = {
  lavender:
    "border-[color-mix(in_srgb,var(--app-color-accent)_35%,var(--app-color-border-default))] bg-[color-mix(in_srgb,var(--app-color-accent-soft)_70%,var(--app-color-surface-container))] text-[var(--app-color-text-primary)]",
  mint:
    "border-[color-mix(in_srgb,var(--app-color-feedback-success)_35%,var(--app-color-border-default))] bg-[color-mix(in_srgb,var(--app-color-feedback-success-soft)_80%,var(--app-color-surface-container))] text-[var(--app-color-text-primary)]",
  peach:
    "border-[color-mix(in_srgb,var(--app-color-feedback-warning)_35%,var(--app-color-border-default))] bg-[color-mix(in_srgb,var(--app-color-feedback-warning-soft)_80%,var(--app-color-surface-container))] text-[var(--app-color-text-primary)]",
  sky:
    "border-[color-mix(in_srgb,var(--app-color-accent-secondary)_35%,var(--app-color-border-default))] bg-[color-mix(in_srgb,var(--app-color-feedback-info-soft)_80%,var(--app-color-surface-container))] text-[var(--app-color-text-primary)]",
  rose:
    "border-[color-mix(in_srgb,var(--app-color-feedback-error)_35%,var(--app-color-border-default))] bg-[color-mix(in_srgb,var(--app-color-feedback-danger-soft)_80%,var(--app-color-surface-container))] text-[var(--app-color-text-primary)]",
};

export function AnalyticsKpiStrip({ items, className }: { items: KpiItem[]; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {items.map((it) => (
        <div
          key={it.label}
          className={cn(
            "rounded-2xl border px-4 py-3.5 shadow-sm transition hover:shadow-md",
            TINT[it.tint ?? "lavender"]
          )}
        >
          <p className="text-xs font-medium text-[var(--app-color-text-secondary)]">{it.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-[var(--app-color-text-primary)]">{it.value}</p>
          {it.hint ? <p className="mt-0.5 text-[11px] text-[var(--app-color-text-tertiary)]">{it.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
