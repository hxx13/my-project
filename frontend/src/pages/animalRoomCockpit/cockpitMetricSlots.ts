import type { TelemetryStructuredMetricSlot } from "@/telemetry-view/types";
import { isSwitchTelemetryMetric, isStatusTelemetryMetric } from "@/telemetry-view/structuredTabs";

/** 驾驶舱柱状图用：温 / 湿 / 压强；与 AnimalRoomTelemetryPage.metricStyleFromKind 判定对齐 */
export type CockpitMetricSlot = "temp" | "hum" | "pressure";

export function parseCockpitTelemetryNumber(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const cleaned = String(raw).trim().replace(/,/g, "");
  const m = cleaned.match(/^(-?\d+(?:\.\d*)?)/);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function ignoredForCockpitNumeric(m: TelemetryStructuredMetricSlot): boolean {
  const item = m.item;
  const kr = (item?.kindRole || "").trim().toUpperCase();
  const mk = (m.metricKindCode || "").trim().toUpperCase();
  const lab = (m.metricKindLabel ?? item?.metricKindLabel ?? "").trim();
  if (isSwitchTelemetryMetric(kr, mk, m.metricKindLabel, item?.displayLabel, item?.variableName)) return true;
  if (isStatusTelemetryMetric(mk, lab)) return true;
  if (kr === "SETPOINT" || mk === "SETPOINT" || lab.includes("设定")) return true;
  if (kr === "LIMIT_MIN" || kr === "LIMIT_MAX") return true;
  return false;
}

/**
 * 将结构化指标格映射为驾驶舱三轴之一；与 metricStyleFromKind（温度/湿度/Pa）一致。
 */
export function cockpitMetricSlotFor(m: TelemetryStructuredMetricSlot): CockpitMetricSlot | null {
  if (ignoredForCockpitNumeric(m)) return null;
  const c = (m.metricKindCode || "").trim().toUpperCase();
  const lab = (m.metricKindLabel ?? m.item?.metricKindLabel ?? "").trim();
  if (c === "TEMP" || (c.length >= 4 && c.startsWith("TEMP"))) return "temp";
  if (c === "HUM" || c === "RH") return "hum";
  if (c === "PRESSURE" || (c.length >= 8 && c.startsWith("PRESSURE"))) return "pressure";
  if (lab.includes("压差") || lab.includes("差压")) return "pressure";
  if (lab.includes("温度")) return "temp";
  if (lab.includes("湿度")) return "hum";
  return null;
}
