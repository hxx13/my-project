import type { TelemetryTagItem } from "./types";

/** 与小程序 animal-room-telemetry.js 一致：自控拉回常态下少打扰，仅在越限/逼近限值且趋势朝向风险时显示箭头 */

const ZONE_FRAC = 0.08;

function parseTelemetryNumeric(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const cleaned = String(raw).trim().replace(/,/g, ".");
  const m = cleaned.match(/^(-?\d+(?:\.\d*)?)/);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseAlarmLimitNumber(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function shouldShowInterventionValueTrend(item: TelemetryTagItem | null | undefined): boolean {
  if (!item) return false;
  const t = String(item.valueTrend || "").trim().toUpperCase();
  if (t !== "UP" && t !== "DOWN") return false;

  const band = String(item.alarmBand || "").trim().toUpperCase();
  if (band === "HIGH" || band === "LOW") return true;
  if (item.alarmOutOfRange === true) return true;

  const v = parseTelemetryNumeric(item.value);
  if (v == null) return false;

  const minN = parseAlarmLimitNumber(item.alarmMinValue);
  const maxN = parseAlarmLimitNumber(item.alarmMaxValue);

  if (minN != null && maxN != null && maxN > minN) {
    const span = maxN - minN;
    const hi = maxN - ZONE_FRAC * span;
    const lo = minN + ZONE_FRAC * span;
    if (t === "UP" && v >= hi) return true;
    if (t === "DOWN" && v <= lo) return true;
    return false;
  }

  if (maxN != null && t === "UP") {
    const margin = Math.max(Math.abs(maxN) * 0.025, 0.55);
    return v >= maxN - margin;
  }
  if (minN != null && t === "DOWN") {
    const margin = Math.max(Math.abs(minN) * 0.025, 0.55);
    return v <= minN + margin;
  }

  return false;
}

/** 返回原始 trend 串（UP/DOWN）供 UI 使用；不满足干预条件时返回 null */
export function interventionValueTrendForDisplay(item: TelemetryTagItem | null | undefined): string | null {
  if (!shouldShowInterventionValueTrend(item)) return null;
  const raw = item?.valueTrend;
  return raw != null && String(raw).trim() !== "" ? String(raw).trim() : null;
}
