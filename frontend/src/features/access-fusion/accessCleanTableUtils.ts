import type { CleanPreviewRow } from "@/api/domains/accessFusion.api";

export function cleanRowClass(row: CleanPreviewRow): string {
  if (row.manualOverride === "FORCE_EXCLUDE") return "bg-rose-50/80 text-slate-500";
  if (row.disposition === "EXCLUDED") return "bg-slate-100/90 text-slate-500 line-through decoration-slate-400";
  if (row.needsReview) return "bg-amber-50/90";
  return "bg-emerald-50/40";
}

export function effectiveInclude(row: CleanPreviewRow, manualOverride?: string | null): boolean {
  if (manualOverride === "FORCE_INCLUDE") return true;
  if (manualOverride === "FORCE_EXCLUDE") return false;
  return row.disposition === "INCLUDED";
}

export type DispositionFilter = "" | "INCLUDED" | "EXCLUDED";
