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

/**
 * **只给冷机用**：优先取变量名里带这几个词的**开关机状态点**，按先后次序找。
 *
 * 一台冷机在变量库里有好几个测点（`冷机1.远程开关机`、`冷机1.温度`、`冷机1.运行时间` …），
 * 名字前缀一模一样。老的取法是「筛出来 → 按名字排序 → 取前 N」，于是取到的是
 * **同一台冷机的 N 个测点**，三格全显示 1 号机的东西 —— 看着就是「参数配错了」。
 * 冷机那格要的是**开停状态**（现场就是这么命名的：`远程开关机`），所以只认这个点，
 * 一台一个，按名字排就是 1 / 2 / 3 号。
 *
 * 只比变量名，不比展示名：展示名/指标名往往整台机都一样，拿它比会把同一台的所有测点都算命中。
 * 一个都挑不到就退回原来的取法 —— 宁可还是老毛病，也不能让格子变空。
 * 其余三类设备（水泵、冷凝塔）走的还是原来那套，一个字节都没动。
 */
const CHILLER_STATE_WORDS = ["远程开关机", "状态"] as const;

function pickChillerPreferringState(
  items: TelemetryTagItem[] | undefined,
  test: (blob: string) => boolean,
  limit: number
): TelemetryTagItem[] {
  if (!items?.length || limit <= 0) return [];
  const hit = items.filter((it) => test(tagBlob(it)));
  for (const word of CHILLER_STATE_WORDS) {
    const mine = hit.filter((it) => String(it.variableName || "").includes(word));
    if (mine.length) {
      mine.sort(sortByVariableName);
      return mine.slice(0, limit);
    }
  }
  hit.sort(sortByVariableName);
  return hit.slice(0, limit);
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

/** 冷机（排除冷却塔）。**优先绑「…-冷机-NN-状态」**，见 pickChillerPreferringState */
export function pickChillerMachineTags(items: TelemetryTagItem[] | undefined, limit = 3): TelemetryTagItem[] {
  return pickChillerPreferringState(
    items,
    (s) => (s.includes("冷机") || s.includes("冷水机组")) && !s.includes("冷却塔") && !s.includes("冷却水塔"),
    limit
  );
}

/** 冷却塔 */
export function pickCoolingTowerTags(items: TelemetryTagItem[] | undefined, limit = 3): TelemetryTagItem[] {
  return pickOrdered(items, (s) => s.includes("冷却塔") || s.includes("冷却水塔"), limit);
}
