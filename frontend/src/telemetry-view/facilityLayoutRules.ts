/**
 * B1F 动力站 / 锅炉房 等设施套间排版规则；配置见 {@link DEFAULT_FACILITY_LAYOUT_RULES_V1}（系统设置 telemetry_facility）。
 */

import {
  DEFAULT_FACILITY_LAYOUT_RULES_V1,
  type FacilityLayoutRulesV1,
} from "./facilityLayoutConfig";
import type { TelemetryStructuredMetricSlot, TelemetryStructuredSuiteGroup } from "./types";
import { isSwitchTelemetryMetric } from "./structuredTabs";

export type { FacilityLayoutRulesV1 };

/** 段名为供水或含 (供水)，如 蒸汽(供水) */
export function segmentIndicatesGongShuiSupply(
  segment: string,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): boolean {
  const s = (segment || "").trim();
  if (!s) return false;
  const g = rules.gongShui;
  if (g.segmentEquals?.some((x) => x === s)) return true;
  return Boolean(g.segmentContains?.some((frag) => frag && s.includes(frag)));
}

export function roomCanonicalHasGongShuiSupplySegment(
  roomCanonical: string,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): boolean {
  const parts = (roomCanonical || "")
    .split("-")
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.some((seg) => segmentIndicatesGongShuiSupply(seg, rules));
}

/** 升入套间标题行的温度/压差类测点（供水路径、动力站、锅炉房共用同一套字典规则） */
export function metricSlotIsGongShuiTitleRowMetric(
  slot: TelemetryStructuredMetricSlot,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): boolean {
  const code = (slot.metricKindCode || "").trim().toUpperCase();
  const tm = rules.titleMetric;
  for (const p of tm.kindCodePrefixes || []) {
    const up = p.trim().toUpperCase();
    if (up && (code === up || code.startsWith(up))) return true;
  }
  const lb = (slot.metricKindLabel || "").trim();
  for (const frag of tm.labelContainsAny || []) {
    if (frag && lb.includes(frag)) return true;
  }
  return false;
}

function suiteNormContainsAny(suiteNorm: string, tokens: string[]): boolean {
  const n = (suiteNorm || "").trim();
  if (!n) return false;
  return tokens.some((t) => t && n.includes(t));
}

export function suiteNormIsPowerStationExclusive(
  suiteNorm: string,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): boolean {
  return suiteNormContainsAny(suiteNorm, rules.basementWebChrome.exclusiveRowIfSuiteNormContains || []);
}

/** 动力站套间：suiteNorm/标题或任一 roomCanonical 含配置 token */
export function suiteIsPowerStationSuite(
  suite: TelemetryStructuredSuiteGroup,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): boolean {
  const tokens = rules.suiteRecognition.powerStation.tokens || [];
  const sn = (suite.suiteNorm || "").trim();
  const st = (suite.suiteTitle || "").trim();
  if (tokens.some((t) => t && (sn.includes(t) || st.includes(t)))) return true;
  for (const r of suite.rooms || []) {
    const rc = r.roomCanonical || "";
    if (tokens.some((t) => t && rc.includes(t))) return true;
  }
  return false;
}

/** 锅炉房套间 */
export function suiteIsBoilerRoomSuite(
  suite: TelemetryStructuredSuiteGroup,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): boolean {
  const tokens = rules.suiteRecognition.boilerRoom.tokens || [];
  const sn = (suite.suiteNorm || "").trim();
  const st = (suite.suiteTitle || "").trim();
  if (tokens.some((t) => t && (sn.includes(t) || st.includes(t)))) return true;
  for (const r of suite.rooms || []) {
    const rc = r.roomCanonical || "";
    if (tokens.some((t) => t && rc.includes(t))) return true;
  }
  return false;
}

/** 如 1F-MAU01、2F-FAU02：数字紧跟缩写时不能用 \\b 词边界，改为子串匹配（与机组 Tab 提取一致） */
function hayContainsHvacUnitAbbrev(hayUpper: string): boolean {
  const u = hayUpper.toUpperCase();
  return (["FAU", "PAU", "AHU", "MAU"] as const).some((tok) => u.includes(tok));
}

export function isHvacMechanicalSuiteGroup(
  suite: TelemetryStructuredSuiteGroup,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): boolean {
  if (suiteIsPowerStationSuite(suite, rules) || suiteIsBoilerRoomSuite(suite, rules)) return true;
  const parts: string[] = [];
  const sn = (suite.suiteNorm || "").trim();
  const st = (suite.suiteTitle || "").trim();
  if (sn) parts.push(sn);
  if (st) parts.push(st);
  for (const r of suite.rooms || []) {
    const rc = (r.roomCanonical || "").trim();
    if (rc) parts.push(rc);
  }
  const hay = parts.join(" ").toUpperCase();
  if (hayContainsHvacUnitAbbrev(hay)) return true;
  if (hay.includes("锅炉")) return true;
  if (hay.includes("动力站")) return true;
  return false;
}

/** 套间名称后方：温度、压差（规则与供水侧升入标题一致） */
export function metricSlotIsSuiteTitleTempPressureMetric(
  slot: TelemetryStructuredMetricSlot,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): boolean {
  return metricSlotIsGongShuiTitleRowMetric(slot, rules);
}

export function suiteNormIsBoilerRoomForSwitchRowMerge(
  suiteNorm: string,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): boolean {
  return suiteNormContainsAny(suiteNorm, rules.basementWebChrome.boilerSwitchRowMergeIfSuiteNormContains || []);
}

/** 套间内是否存在开关类测点（扫原始 rooms，含已升入标题槽的来源） */
export function structuredSuiteHasSwitchMetric(suite: TelemetryStructuredSuiteGroup): boolean {
  for (const room of suite.rooms || []) {
    for (const m of room.metrics || []) {
      const it = m.item;
      if (
        isSwitchTelemetryMetric(
          it?.kindRole,
          m.metricKindCode,
          m.metricKindLabel,
          it?.displayLabel ?? undefined,
          it?.variableName ?? undefined
        )
      ) {
        return true;
      }
    }
  }
  return false;
}
