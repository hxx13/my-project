/** 统计与审计页：语义令牌 class 片段（亮/暗随 --app-color-* 切换） */

export const analyticsFilterShell =
  "rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4 shadow-sm";

export const analyticsFilterShellGradient =
  "rounded-xl border border-[var(--app-color-border-default)] bg-[color-mix(in_srgb,var(--app-color-accent-soft)_42%,var(--app-color-surface-container))] p-4";

export const analyticsChipActive =
  "border-[var(--app-color-accent)] bg-[color-mix(in_srgb,var(--app-color-accent)_22%,var(--app-color-surface-container))] text-[var(--app-color-text-primary)]";

export const analyticsChipIdle =
  "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:border-[var(--app-color-accent-secondary)] hover:bg-[var(--app-color-surface-hover)]";

export const analyticsBtnPrimary =
  "rounded-lg bg-[var(--app-color-accent)] px-3 py-2 text-xs font-medium text-[var(--app-color-text-inverse)] shadow-sm hover:opacity-90 disabled:opacity-50";

export const analyticsEmptyShell =
  "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] py-16 text-center";

export const analyticsInput =
  "rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent-secondary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-color-accent-secondary)_25%,transparent)]";

export const analyticsKpiViolet = "text-[var(--app-color-accent)]";
export const analyticsKpiSuccess = "text-[var(--app-color-feedback-success)]";
export const analyticsKpiWarning = "text-[var(--app-color-feedback-warning)]";
export const analyticsKpiInfo = "text-[var(--app-color-accent-secondary)]";
export const analyticsKpiDanger = "text-[var(--app-color-feedback-error)]";
export const analyticsKpiMuted = "text-[var(--app-color-text-secondary)]";

export const analyticsChartTooltip = {
  borderRadius: 8,
  fontSize: 12,
  background: "var(--app-color-surface-elevated)",
  border: "1px solid var(--app-color-border-default)",
  color: "var(--app-color-text-primary)",
} as const;

export const analyticsChartGridStroke = "var(--app-color-border-default)";
