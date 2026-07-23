import type { FacilityLayoutRulesV1 } from "@/telemetry-view/facilityLayoutConfig";
import { ANIMAL_ROOM_HVAC_TAB_KEY } from "@/telemetry-view/animalTelemetryHvacUnits";
import { isHvacMechanicalSuiteGroup } from "@/telemetry-view/facilityLayoutRules";
import type { TelemetryStructuredFloorTab } from "@/telemetry-view/types";
import type { TelemetryStructuredMetricSlot } from "@/telemetry-view/types";
import { cockpitMetricSlotFor, parseCockpitTelemetryNumber, type CockpitMetricSlot } from "./cockpitMetricSlots";

/** 与 TelemetryTagItem 对齐的驾驶舱柱图用报警元（override 优先于基线上下限） */
export type CockpitBarMetricAlarm = {
  min: number | null;
  max: number | null;
  band?: string | null;
  alarmOutOfRange?: boolean | null;
};

function cockpitAlarmFromStructuredMetric(m: TelemetryStructuredMetricSlot): CockpitBarMetricAlarm | null {
  const item = m.item;
  const minOv = parseCockpitTelemetryNumber(item.alarmOverrideMin);
  const maxOv = parseCockpitTelemetryNumber(item.alarmOverrideMax);
  const minBase = parseCockpitTelemetryNumber(item.alarmMinValue);
  const maxBase = parseCockpitTelemetryNumber(item.alarmMaxValue);
  const min = minOv ?? minBase;
  const max = maxOv ?? maxBase;
  const band = item.alarmBand != null ? String(item.alarmBand).trim() : null;
  const alarmOutOfRange = item.alarmOutOfRange;
  if (min == null && max == null && !band && alarmOutOfRange == null) return null;
  return { min, max, band: band || null, alarmOutOfRange };
}

export type CockpitRoomBarRow = {
  id: string;
  displayTitle: string;
  temp: number | null;
  hum: number | null;
  pressure: number | null;
  /** 与 temp 读数同源指标上的报警配置；无则 null */
  tempAlarm?: CockpitBarMetricAlarm | null;
  humAlarm?: CockpitBarMetricAlarm | null;
  pressureAlarm?: CockpitBarMetricAlarm | null;
};

export type CockpitFloorBlock = {
  tabKey: string;
  title: string;
  rooms: CockpitRoomBarRow[];
};

/**
 * 从结构化楼层 tabs 聚合驾驶舱用「每房间温/湿/压」行。
 * 排除「机房」合成标签页（{@link ANIMAL_ROOM_HVAC_TAB_KEY}）及 {@link isHvacMechanicalSuiteGroup} 套间，仅其余分区。
 */
export function buildCockpitFloorBlocks(
  tabs: TelemetryStructuredFloorTab[] | undefined,
  facilityLayoutRules: FacilityLayoutRulesV1
): CockpitFloorBlock[] {
  if (!tabs?.length) return [];
  const out: CockpitFloorBlock[] = [];
  for (const tab of tabs) {
    if (tab.tabKey === ANIMAL_ROOM_HVAC_TAB_KEY) continue;
    const rooms: CockpitRoomBarRow[] = [];
    for (const sg of tab.suiteGroups) {
      if (isHvacMechanicalSuiteGroup(sg, facilityLayoutRules)) continue;
      for (const card of sg.rooms) {
        const firstBySlot: Partial<Record<CockpitMetricSlot, { value: number; metric: TelemetryStructuredMetricSlot }>> = {};
        for (const m of card.metrics) {
          const slot = cockpitMetricSlotFor(m);
          if (!slot) continue;
          const n = parseCockpitTelemetryNumber(m.item?.value ?? null);
          if (n == null || !Number.isFinite(n)) continue;
          if (!firstBySlot[slot]) {
            firstBySlot[slot] = { value: n, metric: m };
          }
        }
        const tEnt = firstBySlot.temp;
        const hEnt = firstBySlot.hum;
        const pEnt = firstBySlot.pressure;
        const temp = tEnt?.value ?? null;
        const hum = hEnt?.value ?? null;
        const pressure = pEnt?.value ?? null;
        if (temp == null && hum == null && pressure == null) continue;
        rooms.push({
          id: `${tab.tabKey}:${card.roomCanonical}`,
          displayTitle: card.displayTitle || card.roomCanonical,
          temp,
          hum,
          pressure,
          tempAlarm: tEnt ? cockpitAlarmFromStructuredMetric(tEnt.metric) : null,
          humAlarm: hEnt ? cockpitAlarmFromStructuredMetric(hEnt.metric) : null,
          pressureAlarm: pEnt ? cockpitAlarmFromStructuredMetric(pEnt.metric) : null,
        });
      }
    }
    if (rooms.length) {
      out.push({ tabKey: tab.tabKey, title: tab.title || tab.tabKey, rooms });
    }
  }
  return out;
}

const B1F_ROOM_PREFIX_RE = /^B1F/i;

function isB1FPrefixedCockpitRoom(row: CockpitRoomBarRow): boolean {
  const title = (row.displayTitle || "").trim();
  if (B1F_ROOM_PREFIX_RE.test(title)) return true;
  const colon = row.id.indexOf(":");
  const canonical = colon >= 0 ? row.id.slice(colon + 1).trim() : "";
  return B1F_ROOM_PREFIX_RE.test(canonical);
}

/** 分区 tab 标题或 tabKey 以 B1F 开头（如 B1F-E10），其下全部房间归入 B1F 合并列 */
function isB1FPrefixedCockpitBlock(block: CockpitFloorBlock): boolean {
  const t = (block.title || "").trim();
  if (B1F_ROOM_PREFIX_RE.test(t)) return true;
  const k = (block.tabKey || "").trim();
  return B1F_ROOM_PREFIX_RE.test(k);
}

function roomBelongsToB1fMerge(block: CockpitFloorBlock, row: CockpitRoomBarRow): boolean {
  if (isB1FPrefixedCockpitBlock(block)) return true;
  return isB1FPrefixedCockpitRoom(row);
}

/** 驾驶舱 B1F 合成列 {@link mergeB1FPrefixedRoomsIntoSingleCockpitColumn} 的 tabKey */
export const COCKPIT_B1F_MERGED_TAB_KEY = "__cockpit_b1f_merged__";

const FOUR_F_BLOCK_PREFIX_RE = /^4F/i;

function is4FPrefixedCockpitBlock(block: CockpitFloorBlock): boolean {
  const t = (block.title || "").trim();
  if (FOUR_F_BLOCK_PREFIX_RE.test(t)) return true;
  const k = (block.tabKey || "").trim();
  return FOUR_F_BLOCK_PREFIX_RE.test(k);
}

/**
 * 驾驶舱：「B1F 合并」列插在**最后一个**「分区标题或 tabKey 以 4F 开头」的分区之后；若无 4F 分区则置于末尾。
 * - 凡分区 title/tabKey 以 B1F 开头（如 B1F-E10），该列下全部房间并入合并数据源。
 * - 另：展示名或 roomCanonical 以 B1F 开头的房间（落在其它分区时）也并入。
 * UI 上与各分区相同：温/湿/压三张竖直柱图，逐房间原始读数。
 * 已从合并区拿走的分区整列移除，避免重复。
 */
export function mergeB1FPrefixedRoomsIntoSingleCockpitColumn(blocks: CockpitFloorBlock[]): CockpitFloorBlock[] {
  if (!blocks.length) return blocks;

  const merged: CockpitRoomBarRow[] = [];
  const seenId = new Set<string>();
  for (const b of blocks) {
    for (const r of b.rooms) {
      if (!roomBelongsToB1fMerge(b, r)) continue;
      if (seenId.has(r.id)) continue;
      seenId.add(r.id);
      merged.push(r);
    }
  }
  if (!merged.length) return blocks;

  merged.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle, "zh-Hans-CN"));

  const stripped: CockpitFloorBlock[] = [];
  for (const b of blocks) {
    if (isB1FPrefixedCockpitBlock(b)) continue;
    const rooms = b.rooms.filter((r) => !roomBelongsToB1fMerge(b, r));
    if (rooms.length > 0) {
      stripped.push({ ...b, rooms });
    }
  }

  const synthetic: CockpitFloorBlock = {
    tabKey: COCKPIT_B1F_MERGED_TAB_KEY,
    title: "B1F 合并",
    rooms: merged,
  };

  let last4F = -1;
  for (let i = 0; i < stripped.length; i++) {
    if (is4FPrefixedCockpitBlock(stripped[i])) last4F = i;
  }
  if (last4F >= 0) {
    return [...stripped.slice(0, last4F + 1), synthetic, ...stripped.slice(last4F + 1)];
  }
  return [...stripped, synthetic];
}
