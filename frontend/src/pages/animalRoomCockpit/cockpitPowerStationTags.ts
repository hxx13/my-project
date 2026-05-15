import type { TelemetryTagItem } from "@/telemetry-view/types";

function tagBlob(it: TelemetryTagItem): string {
  return `${it.variableName ?? ""}${it.displayLabel ?? ""}${it.metricKindLabel ?? ""}${it.metricKindCode ?? ""}`;
}

function sortByVariableName(a: TelemetryTagItem, b: TelemetryTagItem): number {
  return String(a.variableName || "").localeCompare(String(b.variableName || ""), "zh-Hans-CN");
}

function pickOrdered(
  items: TelemetryTagItem[] | undefined,
  test: (blob: string) => boolean,
  limit: number
): TelemetryTagItem[] {
  if (!items?.length || limit <= 0) return [];
  const out = items.filter((it) => test(tagBlob(it)));
  out.sort(sortByVariableName);
  return out.slice(0, limit);
}

/** 动力站 · 冷冻侧水泵（名称含「冷冻水泵」或同时含冷冻+泵且不含冷却） */
export function pickFrozenChilledWaterPumpTags(items: TelemetryTagItem[] | undefined, limit = 4): TelemetryTagItem[] {
  return pickOrdered(
    items,
    (s) =>
      s.includes("冷冻水泵") ||
      s.includes("冷冻泵") ||
      ((s.includes("冷冻") || s.includes("冷凍")) && s.includes("泵") && !s.includes("冷却") && !s.includes("冷卻")),
    limit
  );
}

/** 动力站 · 冷却侧水泵 */
export function pickCoolingWaterPumpTags(items: TelemetryTagItem[] | undefined, limit = 4): TelemetryTagItem[] {
  return pickOrdered(
    items,
    (s) =>
      s.includes("冷却水泵") ||
      s.includes("冷却泵") ||
      ((s.includes("冷却") || s.includes("冷卻")) && s.includes("泵") && !s.includes("冷冻") && !s.includes("冷凍")),
    limit
  );
}

/** 冷机（排除冷却塔） */
export function pickChillerMachineTags(items: TelemetryTagItem[] | undefined, limit = 3): TelemetryTagItem[] {
  return pickOrdered(
    items,
    (s) => (s.includes("冷机") || s.includes("冷水机组")) && !s.includes("冷却塔") && !s.includes("冷却水塔"),
    limit
  );
}

/** 冷却塔 */
export function pickCoolingTowerTags(items: TelemetryTagItem[] | undefined, limit = 3): TelemetryTagItem[] {
  return pickOrdered(items, (s) => s.includes("冷却塔") || s.includes("冷却水塔"), limit);
}
