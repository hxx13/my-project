import type { TelemetryTagItem } from "@/telemetry-view/types";

/** 用于 pulseOnAlarm 动效：告警带、越限、或质量非好 */
export function telemetryItemNeedsAlarmPulse(item: TelemetryTagItem | undefined): boolean {
  if (!item) return false;
  if (item.alarmOutOfRange === true) return true;
  const band = String(item.alarmBand || "")
    .trim()
    .toUpperCase();
  if (band === "HIGH" || band === "LOW") return true;
  const q = String(item.qualityCode || "").trim();
  if (!q) return false;
  const qu = q.toUpperCase();
  if (qu === "GOOD" || qu === "0") return false;
  return true;
}
