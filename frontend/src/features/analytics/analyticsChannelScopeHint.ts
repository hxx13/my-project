import type { AnalyticsDraftFilter } from "@/features/analytics/analyticsPipelineFilter";

/** 已保存订阅中的通道范围文案 */
export function formatSavedChannelScope(filter: AnalyticsDraftFilter): string {
  const codes = filter.channelCodes?.map((c) => c.trim()).filter(Boolean) ?? [];
  if (codes.length === 0) {
    return "全部已启用清洗通道";
  }
  return `已选 ${codes.length} 个通道：${codes.slice(0, 4).join("、")}${codes.length > 4 ? "…" : ""}`;
}

/** 草稿与已保存 filter 是否不一致（通道或对比周期） */
export function draftDiffersFromSaved(
  draft: AnalyticsDraftFilter,
  saved: AnalyticsDraftFilter
): boolean {
  const norm = (codes: string[]) => [...codes].map((c) => c.trim()).filter(Boolean).sort().join("|");
  const draftAll = draft.channelCodes.length === 0;
  const savedAll = saved.channelCodes.length === 0;
  if (draftAll !== savedAll) return true;
  if (!draftAll && norm(draft.channelCodes) !== norm(saved.channelCodes)) return true;
  const dc = [...draft.compareCycles].sort().join(",");
  const sc = [...saved.compareCycles].sort().join(",");
  return dc !== sc;
}

/** 从快照 filterSnapshot 解析实查通道说明 */
export function formatResolvedScopeFromSnapshot(
  filterSnapshot?: Record<string, unknown> | null
): string | null {
  if (!filterSnapshot) return null;
  const pkg = filterSnapshot.packageFilter;
  if (!pkg || typeof pkg !== "object") return null;
  const p = pkg as Record<string, unknown>;
  const resolved = p.resolvedChannelCodes;
  if (Array.isArray(resolved) && resolved.length > 0) {
    const label = p.channelScopeLabel;
    if (typeof label === "string" && label.trim()) return label;
    return `实查 ${resolved.length} 个通道`;
  }
  return null;
}
