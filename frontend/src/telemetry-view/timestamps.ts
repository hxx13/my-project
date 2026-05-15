import type { TelemetryTagItem } from "./types";

export function maxTelemetryItemTimestampsMs(items: TelemetryTagItem[]): number | null {
  let max: number | null = null;
  for (const it of items) {
    const ts = it.timestamp;
    if (!ts) continue;
    const t = Date.parse(ts);
    if (!Number.isFinite(t)) continue;
    max = max == null ? t : Math.max(max, t);
  }
  return max;
}
