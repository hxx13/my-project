/**
 * 动物房温湿度：机房（FAU/PAU/AHU/MAU、锅炉房、动力站等）侧栏「机房」Tab、Web 布局与变量名聚合。
 */

import type { AnimalRoomHubChromeCell, AnimalRoomHubTab, AnimalRoomHubViewChunk } from "../api/telemetryApi";
import type { PreparedSuite } from "./floorChunks";
import { isHvacMechanicalSuiteGroup } from "./facilityLayoutRules";
import type { FacilityLayoutRulesV1 } from "./facilityLayoutConfig";
import { DEFAULT_FACILITY_LAYOUT_RULES_V1 } from "./facilityLayoutConfig";
import type { TelemetryStructuredFloorTab, TelemetryStructuredRoomCard, TelemetryStructuredSuiteGroup } from "./types";

export const ANIMAL_ROOM_HVAC_TAB_KEY = "__hvac_units__";

export function isHvacPreparedSuite(
  prepared: PreparedSuite,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): boolean {
  return isHvacMechanicalSuiteGroup(prepared.suite, rules);
}

function hubChromeCellIsHvacColumn(cell: AnimalRoomHubChromeCell, rules: FacilityLayoutRulesV1): boolean {
  if (cell.prepared && isHvacPreparedSuite(cell.prepared, rules)) return true;
  const side = cell.webSidecarPreparedSuites;
  if (!cell.prepared && Array.isArray(side) && side.length) {
    return side.every((p) => isHvacPreparedSuite(p, rules));
  }
  return false;
}

function splitHubChromeList(
  list: AnimalRoomHubChromeCell[],
  rules: FacilityLayoutRulesV1
): { primary: AnimalRoomHubChromeCell[]; hvac: AnimalRoomHubChromeCell[] } {
  const primary: AnimalRoomHubChromeCell[] = [];
  const hvac: AnimalRoomHubChromeCell[] = [];
  for (const cell of list) {
    if (hubChromeCellIsHvacColumn(cell, rules)) hvac.push(cell);
    else primary.push(cell);
  }
  return { primary, hvac };
}

function microRoomCardIsHvacMechanical(card: TelemetryStructuredRoomCard, rules: FacilityLayoutRulesV1): boolean {
  const sg: TelemetryStructuredSuiteGroup = {
    tabKey: "",
    floorCode: "",
    bundleCode: "",
    bundleTitle: "",
    suiteNorm: "",
    suiteTitle: (card.displayTitle || "").trim(),
    sortKey: "",
    rooms: [card],
  };
  return isHvacMechanicalSuiteGroup(sg, rules);
}

/**
 * 普通楼层 Tab 展示用：去掉已在「机房」Tab 聚合的套间 / chrome 列，避免与机房分区重复。
 */
export function filterHubChunksExcludeHvacUnits(
  chunks: AnimalRoomHubViewChunk[],
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): AnimalRoomHubViewChunk[] {
  const out: AnimalRoomHubViewChunk[] = [];
  for (const ch of chunks) {
    if (ch.kind === "suite" && ch.prepared && isHvacPreparedSuite(ch.prepared, rules)) {
      continue;
    }
    if (ch.kind === "chromeSuiteRow" && ch.list?.length) {
      const newList: AnimalRoomHubChromeCell[] = [];
      for (const cell of ch.list) {
        const micro = cell.webSoloMicroGrid?.filter(Boolean) ?? [];
        if (micro.length) {
          const kept = micro.filter((c) => !microRoomCardIsHvacMechanical(c, rules));
          if (!kept.length) continue;
          newList.push(kept.length === micro.length ? cell : { ...cell, webSoloMicroGrid: kept });
          continue;
        }
        const mainPrep = cell.prepared ?? undefined;
        const sidePrep = (cell.webSidecarPreparedSuites ?? []).filter(Boolean);
        const mainHvac = Boolean(mainPrep && isHvacPreparedSuite(mainPrep, rules));
        const sidesKept = sidePrep.filter((p) => !isHvacPreparedSuite(p, rules));
        let next: AnimalRoomHubChromeCell = { ...cell };
        if (mainHvac) {
          next = { ...next, prepared: undefined };
        }
        if (sidePrep.length && sidesKept.length !== sidePrep.length) {
          next = { ...next, webSidecarPreparedSuites: sidesKept.length ? sidesKept : undefined };
        }
        const hasPrepared = Boolean(next.prepared);
        const hasSides = (next.webSidecarPreparedSuites?.length ?? 0) > 0;
        const hasMicro = (next.webSoloMicroGrid?.filter(Boolean).length ?? 0) > 0;
        if (!hasPrepared && !hasSides && !hasMicro) continue;
        newList.push(next);
      }
      if (!newList.length) continue;
      const prevList = ch.list ?? [];
      const unchanged =
        newList.length === prevList.length &&
        newList.every((c, i) => c === prevList[i]);
      out.push(unchanged ? ch : { ...ch, key: `${ch.key}-no-hvac`, list: newList });
      continue;
    }
    out.push(ch);
  }
  return out;
}

export function extractHvacOnlyHubChunks(
  chunks: AnimalRoomHubViewChunk[],
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): AnimalRoomHubViewChunk[] {
  const out: AnimalRoomHubViewChunk[] = [];
  for (const ch of chunks) {
    if (ch.kind === "suite" && ch.prepared && isHvacPreparedSuite(ch.prepared, rules)) {
      out.push(ch);
      continue;
    }
    if (ch.kind === "chromeSuiteRow" && ch.list?.length) {
      const { hvac } = splitHubChromeList(ch.list, rules);
      if (hvac.length) {
        out.push({ ...ch, key: `${ch.key}-hvac`, list: hvac });
      }
    }
  }
  return out;
}

export type BuildSyntheticHvacHubTabOptions = {
  /** 默认 true：每层前插 `zoneBand`（楼层标题）；false 则合并为一段接力，避免区带切段导致小段双栏 */
  emitSourceTabBands?: boolean;
};

export function buildSyntheticHvacHubTab(
  tabs: Array<Pick<AnimalRoomHubTab, "tabKey" | "title" | "viewChunks">>,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1,
  options?: BuildSyntheticHvacHubTabOptions
): AnimalRoomHubTab | null {
  const emitSourceTabBands = options?.emitSourceTabBands !== false;
  const outChunks: AnimalRoomHubViewChunk[] = [];
  let anyHvac = false;
  for (const tab of tabs) {
    const tk = (tab.tabKey || "").trim();
    if (!tk || tk === ANIMAL_ROOM_HVAC_TAB_KEY) continue;
    const hv = extractHvacOnlyHubChunks(tab.viewChunks ?? [], rules);
    if (!hv.length) continue;
    anyHvac = true;
    if (emitSourceTabBands) {
      outChunks.push({
        kind: "zoneBand",
        key: `hvac-band-${tk}`,
        zoneLabel: tab.title ?? tab.tabKey ?? "—",
      });
    }
    outChunks.push(...hv);
  }
  if (!anyHvac) return null;
  return {
    tabKey: ANIMAL_ROOM_HVAC_TAB_KEY,
    title: "机房",
    roomCount: 0,
    suiteCount: 0,
    viewChunks: outChunks,
  };
}

export function buildSyntheticHvacStructTab(
  structTabs: TelemetryStructuredFloorTab[],
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): TelemetryStructuredFloorTab | null {
  const suiteGroups: TelemetryStructuredSuiteGroup[] = [];
  for (const tab of structTabs) {
    for (const sg of tab.suiteGroups ?? []) {
      if (isHvacMechanicalSuiteGroup(sg, rules)) suiteGroups.push(sg);
    }
  }
  if (!suiteGroups.length) return null;
  const ref = structTabs[0];
  return {
    tabKey: ANIMAL_ROOM_HVAC_TAB_KEY,
    title: "机房",
    floorCode: ref?.floorCode ?? "_hvac_",
    bundleCode: ref?.bundleCode ?? "_hvac_",
    bundleTitle: "机房",
    suiteGroups,
  };
}

function walkPreparedVariableNames(p: PreparedSuite, out: Set<string>): void {
  for (const s of p.titleSlots ?? []) {
    const v = (s.item?.variableName || "").trim();
    if (v) out.add(v);
  }
  for (const room of p.visibleRooms ?? []) {
    for (const m of room.metrics ?? []) {
      const v = (m.item?.variableName || "").trim();
      if (v) out.add(v);
    }
  }
}

export function collectVariableNamesFromHubChunks(chunks: AnimalRoomHubViewChunk[]): string[] {
  const out = new Set<string>();
  for (const ch of chunks) {
    if (ch.kind === "zoneBand" || ch.kind === "zoneCard") continue;
    if (ch.kind === "suite" && ch.prepared) {
      walkPreparedVariableNames(ch.prepared, out);
      continue;
    }
    if (ch.kind === "chromeSuiteRow" && ch.list?.length) {
      for (const cell of ch.list) {
        if (cell.prepared) walkPreparedVariableNames(cell.prepared, out);
        for (const p of cell.webSidecarPreparedSuites ?? []) {
          walkPreparedVariableNames(p, out);
        }
        for (const card of cell.webSoloMicroGrid ?? []) {
          for (const m of card.metrics ?? []) {
            const v = (m.item?.variableName || "").trim();
            if (v) out.add(v);
          }
        }
      }
    }
  }
  return Array.from(out);
}

export function collectVariableNamesFromStructuredSuites(suites: TelemetryStructuredSuiteGroup[]): string[] {
  const out = new Set<string>();
  for (const sg of suites) {
    for (const room of sg.rooms ?? []) {
      for (const m of room.metrics ?? []) {
        const v = (m.item?.variableName || "").trim();
        if (v) out.add(v);
      }
    }
  }
  return Array.from(out);
}
