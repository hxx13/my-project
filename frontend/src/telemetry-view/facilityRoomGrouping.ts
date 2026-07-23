/**
 * 设施类「小房间」折叠：配置驱动 {@link DEFAULT_FACILITY_LAYOUT_RULES_V1} / 系统设置 telemetry_facility。
 * 与 Java FacilityLayoutRulebook 一致。
 */

import {
  DEFAULT_FACILITY_LAYOUT_RULES_V1,
  type FacilityLayoutRulesV1,
  sortedFacilityKeywords,
} from "./facilityLayoutConfig";
import { compareMetricsInRoomRowOrder } from "./roomMetricDisplayOrder";

export type { FacilityLayoutRulesV1 };

/** 段内设施名：允许「冷却塔」或与设施名粘连的数字（如「冷却塔01」极少见） */
function segmentMatchesFacilityKeyword(segment: string, keyword: string): boolean {
  const s = segment.trim();
  if (!s) return false;
  if (s === keyword) return true;
  if (!s.startsWith(keyword)) return false;
  const rest = s.slice(keyword.length);
  return rest.length > 0 && /^\d+$/.test(rest);
}

/**
 * 折叠 roomCanonical：「…-冷却塔-01」「…-冷却塔-02」→「…-冷却塔」同一卡片。
 * 未命中设施关键字时原样返回。
 */
export function facilityRoomCardIdentity(
  roomCanonical: string,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): string {
  const r = (roomCanonical || "").trim();
  if (!r) return r;
  const parts = r
    .split("-")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 2) return r;

  const kws = sortedFacilityKeywords(rules);
  for (let pi = 0; pi < parts.length; pi++) {
    const seg = parts[pi]!;
    for (const kw of kws) {
      if (!segmentMatchesFacilityKeyword(seg, kw)) continue;
      const next = parts[pi + 1];
      if (next != null && /^\d+$/.test(next)) {
        return parts.slice(0, pi + 1).join("-");
      }
      return parts.slice(0, pi + 1).join("-");
    }
  }
  return r;
}

/**
 * 设施卡片内排序：命中「设施-编号」时取编号；否则 0（与其它测点稳定排序一起用）。
 */
export function facilitySlotOrdinalFromRoomCanonical(
  roomCanonical: string,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): number {
  const r = (roomCanonical || "").trim();
  if (!r) return 0;
  const parts = r
    .split("-")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const kws = sortedFacilityKeywords(rules);
  for (let pi = 0; pi < parts.length; pi++) {
    const seg = parts[pi]!;
    for (const kw of kws) {
      if (!segmentMatchesFacilityKeyword(seg, kw)) continue;
      const next = parts[pi + 1];
      if (next != null && /^\d+$/.test(next)) {
        const n = parseInt(next, 10);
        return Number.isFinite(n) ? n : 0;
      }
      return 0;
    }
  }
  return 0;
}

export function compareMetricsInFacilityRoom(
  a: { metricKindCode?: string | null; item?: { roomCanonical?: string | null } },
  b: { metricKindCode?: string | null; item?: { roomCanonical?: string | null } },
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): number {
  const oa = facilitySlotOrdinalFromRoomCanonical(a.item?.roomCanonical ?? "", rules);
  const ob = facilitySlotOrdinalFromRoomCanonical(b.item?.roomCanonical ?? "", rules);
  if (oa !== ob) return oa - ob;
  return compareMetricsInRoomRowOrder(a, b);
}
