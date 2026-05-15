import {
  metricSlotIsGongShuiTitleRowMetric,
  metricSlotIsSuiteTitleTempPressureMetric,
  roomCanonicalHasGongShuiSupplySegment,
  suiteIsBoilerRoomSuite,
  suiteIsPowerStationSuite,
  suiteNormIsPowerStationExclusive,
} from "./facilityLayoutRules";
import { DEFAULT_FACILITY_LAYOUT_RULES_V1, type FacilityLayoutRulesV1 } from "./facilityLayoutConfig";
import {
  compareBasementPlaneZoneKeys,
  DEFAULT_PLANE_ZONE_KEY,
  isSwitchTelemetryMetric,
  zoneKeyForFloorTab,
} from "./structuredTabs";
import {
  basementSuiteRoomSegment,
  isBaseRoomCanonical,
  isBasementFloorScopeTabKey,
  isSuiteConceptFloor,
  localPartRoomCanonical,
  standardSuiteRoomSegment,
} from "./roomGrouping";
import { maxTelemetryItemTimestampsMs } from "./timestamps";
import type {
  TelemetryStructuredFloorTab,
  TelemetryStructuredMetricSlot,
  TelemetryStructuredRoomCard,
  TelemetryStructuredSuiteGroup,
} from "./types";

function roomSegmentForBandRules(roomCanonical: string, tabKey: string): string {
  if (isSuiteConceptFloor(tabKey)) return standardSuiteRoomSegment(roomCanonical);
  if (isBasementFloorScopeTabKey(tabKey)) return basementSuiteRoomSegment(roomCanonical);
  return localPartRoomCanonical(roomCanonical);
}

function isPureThreeDigitLocal(roomCanonical: string, tabKey: string): boolean {
  const tok = roomSegmentForBandRules(roomCanonical, tabKey);
  return /^\d{3}$/.test(tok);
}

function suiteRawHasPureDigitSingleNonBase(suite: TelemetryStructuredSuiteGroup): boolean {
  const tabKey = suite.tabKey;
  for (const room of suite.rooms) {
    if (
      isPureThreeDigitLocal(room.roomCanonical, tabKey) &&
      room.metrics.length === 1 &&
      !isBaseRoomCanonical(room.roomCanonical, tabKey)
    ) {
      return true;
    }
  }
  return false;
}

export type PreparedSuite = {
  suite: TelemetryStructuredSuiteGroup;
  titleSlots: TelemetryStructuredMetricSlot[];
  visibleRooms: TelemetryStructuredRoomCard[];
};

/**
 * 套间标题行：所有开关类测点排在标题后最前，彼此之间按变量名稳定排序（不随 ON/OFF 变化）。
 */
function orderTitleSlotsWithSwitchesFirst(slots: TelemetryStructuredMetricSlot[]): TelemetryStructuredMetricSlot[] {
  const sw: TelemetryStructuredMetricSlot[] = [];
  const rest: TelemetryStructuredMetricSlot[] = [];
  for (const m of slots) {
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
      sw.push(m);
    } else {
      rest.push(m);
    }
  }
  sw.sort((a, b) =>
    (a.item?.variableName || "").localeCompare(b.item?.variableName || "", "zh-CN", {
      numeric: true,
      sensitivity: "base",
    })
  );
  return [...sw, ...rest];
}

/** 基间单测点默认升入标题槽；状态(STATUS) 为测量值，保留为房间内卡片，不跟在套间名称后 */
function metricSlotPreferTitleRowOverCard(slot: TelemetryStructuredMetricSlot): boolean {
  const c = (slot.metricKindCode || "").trim().toUpperCase();
  if (c === "STATUS") return false;
  const lab = (slot.metricKindLabel || "").trim();
  if (lab === "状态") return false;
  return true;
}

export function prepareSuiteDisplay(
  suite: TelemetryStructuredSuiteGroup,
  rules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): PreparedSuite {
  const leadingSupplyTitleSlots: TelemetryStructuredMetricSlot[] = [];
  const leadingPowerStationTitleSlots: TelemetryStructuredMetricSlot[] = [];
  const leadingBoilerRoomTitleSlots: TelemetryStructuredMetricSlot[] = [];
  const titleSlots: TelemetryStructuredMetricSlot[] = [];
  const visibleRooms: TelemetryStructuredRoomCard[] = [];
  const powerStationSuite = suiteIsPowerStationSuite(suite, rules);
  const boilerRoomSuite = suiteIsBoilerRoomSuite(suite, rules);

  for (const room of suite.rooms) {
    let work = room;
    const metrics = room.metrics ?? [];

    if (roomCanonicalHasGongShuiSupplySegment(room.roomCanonical, rules)) {
      const promote: TelemetryStructuredMetricSlot[] = [];
      const keep: TelemetryStructuredMetricSlot[] = [];
      for (const m of metrics) {
        if (metricSlotIsGongShuiTitleRowMetric(m, rules)) promote.push(m);
        else keep.push(m);
      }
      if (promote.length > 0) {
        leadingSupplyTitleSlots.push(...promote);
        if (keep.length === 0) continue;
        work = { ...room, metrics: keep };
      }
    }

    if (powerStationSuite) {
      const wm = work.metrics ?? [];
      const promotePs: TelemetryStructuredMetricSlot[] = [];
      const keepPs: TelemetryStructuredMetricSlot[] = [];
      for (const m of wm) {
        if (metricSlotIsSuiteTitleTempPressureMetric(m, rules)) promotePs.push(m);
        else keepPs.push(m);
      }
      if (promotePs.length > 0) {
        leadingPowerStationTitleSlots.push(...promotePs);
        if (keepPs.length === 0) continue;
        work = { ...work, metrics: keepPs };
      }
    }

    if (boilerRoomSuite) {
      const wm = work.metrics ?? [];
      const promoteBr: TelemetryStructuredMetricSlot[] = [];
      const keepBr: TelemetryStructuredMetricSlot[] = [];
      for (const m of wm) {
        if (metricSlotIsSuiteTitleTempPressureMetric(m, rules)) promoteBr.push(m);
        else keepBr.push(m);
      }
      if (promoteBr.length > 0) {
        leadingBoilerRoomTitleSlots.push(...promoteBr);
        if (keepBr.length === 0) continue;
        work = { ...work, metrics: keepBr };
      }
    }

    if (isBaseRoomCanonical(work.roomCanonical, suite.tabKey) && work.metrics.length === 1) {
      const only = work.metrics[0]!;
      if (metricSlotPreferTitleRowOverCard(only)) titleSlots.push(only);
      else visibleRooms.push(work);
    } else {
      visibleRooms.push(work);
    }
  }
  const mergedTitleSlots = [
    ...leadingSupplyTitleSlots,
    ...leadingPowerStationTitleSlots,
    ...leadingBoilerRoomTitleSlots,
    ...titleSlots,
  ];
  return {
    suite,
    titleSlots: orderTitleSlotsWithSwitchesFirst(mergedTitleSlots),
    visibleRooms,
  };
}

export function suiteLatestMsPrepared(ps: PreparedSuite): number | null {
  const fromRooms = ps.visibleRooms.flatMap((r) => r.metrics.map((m) => m.item));
  const fromTitle = ps.titleSlots.map((m) => m.item);
  return maxTelemetryItemTimestampsMs([...fromRooms, ...fromTitle]);
}

export type SoloPartition = { label: string; cards: TelemetryStructuredRoomCard[]; zoneSub?: string };

/** 与后端一致：单间仅 1 测点不传标题 */
export const SOLO_PARTITION_LABEL_SINGLE_METRIC = "";

/** 单间分桶内卡片顺序随套间/房间遍历顺序，不强制按房间名排序；三列网格末行余 2 时由 {@link splitSoloCardsFixedMaxColsWithLoneRemainder} 保证同排两张。 */
export function partitionSoloCards(suites: TelemetryStructuredSuiteGroup[]): SoloPartition[] {
  const triple: TelemetryStructuredRoomCard[] = [];
  const pair: TelemetryStructuredRoomCard[] = [];
  const single: TelemetryStructuredRoomCard[] = [];
  const other: TelemetryStructuredRoomCard[] = [];
  for (const su of suites) {
    for (const card of su.rooms) {
      const m = card.metrics.length;
      if (m === 3) triple.push(card);
      else if (m === 2) pair.push(card);
      else if (m === 1) single.push(card);
      else other.push(card);
    }
  }
  const out: SoloPartition[] = [];
  if (triple.length) out.push({ label: "单间 · 三项参数", cards: triple });
  if (pair.length) out.push({ label: "单间 · 两项参数", cards: pair });
  if (single.length) out.push({ label: SOLO_PARTITION_LABEL_SINGLE_METRIC, cards: single });
  if (other.length) out.push({ label: "单间 · 其他项数", cards: other });
  return out;
}

function sortZoneKeys(keys: string[]): string[] {
  return [...keys].sort(compareBasementPlaneZoneKeys);
}

const SOLO_PARTITION_LABEL_ORDER = [
  "单间 · 三项参数",
  "单间 · 两项参数",
  SOLO_PARTITION_LABEL_SINGLE_METRIC,
  "单间 · 其他项数",
] as const;

function mergeZoneSub(a?: string, b?: string): string | undefined {
  const parts = [a, b].flatMap((x) => (x ? x.split(" · ").map((s) => s.trim()).filter(Boolean) : []));
  const uniq = [...new Set(parts)];
  return uniq.length ? uniq.join(" · ") : undefined;
}

function mergeSoloPartitions(a: SoloPartition[], b: SoloPartition[]): SoloPartition[] {
  const map = new Map<string, { cards: TelemetryStructuredRoomCard[]; zoneSub?: string }>();
  for (const p of [...a, ...b]) {
    const cur = map.get(p.label);
    if (!cur) {
      map.set(p.label, { cards: [...p.cards], zoneSub: p.zoneSub });
    } else {
      cur.cards.push(...p.cards);
      cur.zoneSub = mergeZoneSub(cur.zoneSub, p.zoneSub);
    }
  }
  const ordered: SoloPartition[] = [];
  for (const label of SOLO_PARTITION_LABEL_ORDER) {
    const ent = map.get(label);
    if (ent?.cards.length) {
      ordered.push({ label, cards: ent.cards, ...(ent.zoneSub ? { zoneSub: ent.zoneSub } : {}) });
    }
    map.delete(label);
  }
  for (const [label, ent] of map) {
    if (ent.cards.length) ordered.push({ label, cards: ent.cards, ...(ent.zoneSub ? { zoneSub: ent.zoneSub } : {}) });
  }
  return ordered;
}

export type FloorChunk =
  | { kind: "zoneBand"; zoneLabel: string; key: string }
  /** 接力展平：由 `zoneBand` 转成，与套间/单间同属一列排版（半幅标识卡） */
  | { kind: "zoneCard"; zoneLabel: string; key: string }
  | { kind: "suite"; prepared: PreparedSuite; key: string }
  | { kind: "chromeSuiteRow"; preparedList: PreparedSuite[]; rowKind: "large3" | "medium2" | "medium3"; key: string }
  | { kind: "solos"; partitions: SoloPartition[]; key: string };

function mergeConsecutiveSoloChunks(chunks: FloorChunk[]): FloorChunk[] {
  const out: FloorChunk[] = [];
  for (const ch of chunks) {
    if (ch.kind === "zoneBand" || ch.kind === "zoneCard") {
      out.push(ch);
      continue;
    }
    if (ch.kind !== "solos") {
      out.push(ch);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev?.kind === "solos") {
      prev.partitions = mergeSoloPartitions(prev.partitions, ch.partitions);
      prev.key = `${prev.key}++${ch.key}`;
    } else {
      out.push({
        kind: "solos",
        partitions: ch.partitions.map((p) => ({
          label: p.label,
          cards: [...p.cards],
          ...(p.zoneSub ? { zoneSub: p.zoneSub } : {}),
        })),
        key: ch.key,
      });
    }
  }
  return out;
}

/** 将 n 拆成 rowCount 行，各行个数至多相差 1 */
export function splitEvenRowSizes(n: number, rowCount: number): number[] {
  const r = Math.min(Math.max(1, rowCount), n);
  const base = Math.floor(n / r);
  const rem = n % r;
  const sizes: number[] = [];
  for (let i = 0; i < r; i++) sizes.push(base + (i < rem ? 1 : 0));
  return sizes;
}

export const SOLO_GRID_GAP_PX = 8;

/** Web 单间网格：再宽也不超过该列数，避免单测点卡片一行 7+ 个时内部信息挤叠 */
export const SOLO_BALANCED_GRID_MAX_COLS = 6;

/** 动物房等半栏单间卡：每行并排上限（与 relay 套间三拼一致） */
export const ANIMAL_ROOM_SOLO_GRID_MAX_COLS_PER_ROW = 3;

/**
 * 固定每行最多 `maxCols` 张（动物房半栏常为 3）：
 * - 余 **1**：前若干行满列，末行 **1 张**独占一行（撑满）。例 7 张、3 列 → [3,3,1]，而非 [3,2,2]。
 * - 余 **2**：前若干行满列，末行 **2 张同一行**并排（各占半行宽）。例 8 张、3 列 → [3,3,2]。
 * 不改变 `cards` 的相对顺序（不另做 roomCanonical 稳定排序），以便与 API/套间遍历顺序一致。
 */
export function splitSoloCardsFixedMaxColsWithLoneRemainder<T>(
  cards: readonly T[],
  maxCols: number
): T[][] {
  const n = cards.length;
  if (n === 0) return [];
  const m = Math.min(Math.max(1, maxCols), SOLO_BALANCED_GRID_MAX_COLS);
  if (m === 1) return cards.map((c) => [c]);
  if (n <= m) {
    return [cards.slice() as T[]];
  }
  const rem = n % m;
  if (rem === 0) {
    const rows: T[][] = [];
    for (let off = 0; off < n; off += m) {
      rows.push(cards.slice(off, off + m) as T[]);
    }
    return rows;
  }
  if (rem === 1) {
    const fullRows = (n - 1) / m;
    const rows: T[][] = [];
    let off = 0;
    for (let r = 0; r < fullRows; r++, off += m) {
      rows.push(cards.slice(off, off + m) as T[]);
    }
    rows.push(cards.slice(off, n) as T[]);
    return rows;
  }
  if (rem === 2) {
    const fullRows = (n - 2) / m;
    const rows: T[][] = [];
    let off = 0;
    for (let r = 0; r < fullRows; r++, off += m) {
      rows.push(cards.slice(off, off + m) as T[]);
    }
    rows.push(cards.slice(off, off + 2) as T[]);
    return rows;
  }
  const rows: T[][] = [];
  let i = 0;
  while (i < n) {
    const left = n - i;
    if (left <= m) {
      rows.push(cards.slice(i, n) as T[]);
      break;
    }
    if (left % m === 1) {
      rows.push(cards.slice(i, i + m) as T[]);
      i += m;
    } else {
      rows.push(cards.slice(i, i + m) as T[]);
      i += m;
    }
  }
  return rows;
}

/** 按容器宽度估算每行最多几列（不超过 {@link SOLO_BALANCED_GRID_MAX_COLS} 与可选 maxCols），再算最少行数，均分行数后切成多行二维数组 */
export function rowSplitsForBalancedSoloGrid(
  cards: TelemetryStructuredRoomCard[],
  containerWidthPx: number,
  minCardPx: number,
  options?: {
    maxCols?: number;
    /** 为 true 时忽略宽度压列，按 maxCols 满行切：余 1 独占末行、余 2 末行两张并排（动物房半栏） */
    forceFixedMaxCols?: boolean;
  }
): TelemetryStructuredRoomCard[][] {
  const n = cards.length;
  if (n === 0) return [];
  if (options?.forceFixedMaxCols === true && options.maxCols != null) {
    return splitSoloCardsFixedMaxColsWithLoneRemainder(cards, options.maxCols);
  }
  if (containerWidthPx < 48) return [cards];
  const colCap =
    options?.maxCols != null
      ? Math.min(Math.max(1, options.maxCols), SOLO_BALANCED_GRID_MAX_COLS)
      : SOLO_BALANCED_GRID_MAX_COLS;
  const maxPerRow = Math.min(
    colCap,
    Math.max(
      1,
      Math.floor((containerWidthPx + SOLO_GRID_GAP_PX) / (minCardPx + SOLO_GRID_GAP_PX))
    )
  );
  const rowCount = Math.min(n, Math.max(1, Math.ceil(n / maxPerRow)));
  const sizes = splitEvenRowSizes(n, rowCount);
  const rows: TelemetryStructuredRoomCard[][] = [];
  let off = 0;
  for (const sz of sizes) {
    rows.push(cards.slice(off, off + sz));
    off += sz;
  }
  return rows;
}

export function soloMinCardPxForPartition(label: string): number {
  if (label === "单间 · 三项参数") return 200;
  if (label === "单间 · 两项参数") return 176;
  if (!label) return 168;
  return 176;
}

export function suiteHasChrome(suite: TelemetryStructuredSuiteGroup): boolean {
  if (!isSuiteConceptFloor(suite.tabKey) && !isBasementFloorScopeTabKey(suite.tabKey)) return false;
  return suite.rooms.length > 1;
}

function outerSuiteBand(
  prepared: PreparedSuite,
  rawSuite: TelemetryStructuredSuiteGroup
): "pairLarge" | "triplePack" | "single" {
  const v = prepared.visibleRooms.length;
  if (v >= 3) return "pairLarge";
  if (v === 2 && !suiteRawHasPureDigitSingleNonBase(rawSuite)) return "triplePack";
  return "single";
}

type ChromeQueued = { prepared: PreparedSuite; isLargeSuite: boolean };

export type BuildFloorChunksOptions = {
  /**
   * Web：两小间套间一行最多 3 套（均分一行）；小程序竖屏传 1 每行一套。
   */
  chromeMediumRowMax?: number;
  /** B1F 设施：动力站 chrome 独占一行（与 Java Hub 一致） */
  webBasementFacilityLayout?: boolean;
  /** 与系统设置 telemetry_facility 同步；缺省用内置默认 */
  facilityLayoutRules?: FacilityLayoutRulesV1;
  /**
   * 默认 `true`：地下室等按 E 区插入 `zoneBand`（展平接力时转为 `zoneCard`，与套间同列排版）。
   * `false`：不插入分区带，仅保留区内顺序。
   */
  emitZoneBands?: boolean;
};

/** 地下室 B 层内按 E 区；其它层 DEFAULT（无分区带） */
export function zoneKeyForSuiteGroup(suite: TelemetryStructuredSuiteGroup): string {
  const r0 = suite.rooms[0];
  if (!r0) return DEFAULT_PLANE_ZONE_KEY;
  return zoneKeyForFloorTab(suite.tabKey, r0.roomCanonical || "");
}

function orderedZoneBlocksFromSuiteGroups(
  suiteGroups: TelemetryStructuredSuiteGroup[]
): { zoneKey: string; groups: TelemetryStructuredSuiteGroup[] }[] {
  const zoneMap = new Map<string, TelemetryStructuredSuiteGroup[]>();
  for (const sg of suiteGroups) {
    const zk = zoneKeyForSuiteGroup(sg);
    if (!zoneMap.has(zk)) zoneMap.set(zk, []);
    zoneMap.get(zk)!.push(sg);
  }
  return sortZoneKeys([...zoneMap.keys()]).map((zoneKey) => ({
    zoneKey,
    groups: zoneMap.get(zoneKey)!,
  }));
}

/**
 * 仅对一组套间序列排版（不含 zoneBand；供按 E 区分块多次调用）。
 * 块内顺序：套间 chrome → 单间；单间再按参数项数分桶（不提升于 E 区，因块已按区切开）。
 */
function buildFloorChunksForSuiteSequence(
  tabKey: string,
  suiteGroups: TelemetryStructuredSuiteGroup[],
  chromeMediumRowMax: number,
  webBasementFacilityLayout: boolean,
  layoutRules: FacilityLayoutRulesV1
): FloorChunk[] {
  const out: FloorChunk[] = [];
  let solos: TelemetryStructuredSuiteGroup[] = [];
  let chromeQueue: ChromeQueued[] = [];

  const flushSolos = () => {
    if (solos.length === 0) return;
    const partitions = partitionSoloCards(solos);
    if (partitions.length > 0) {
      out.push({
        kind: "solos",
        partitions,
        key: `solos-${solos.map((s) => s.suiteNorm).join("|")}`,
      });
    }
    solos = [];
  };

  const flushChromeQueue = () => {
    if (chromeQueue.length === 0) return;
    let i = 0;
    while (i < chromeQueue.length) {
      const isLarge = chromeQueue[i]!.isLargeSuite;
      let j = i + 1;
      while (j < chromeQueue.length && chromeQueue[j]!.isLargeSuite === isLarge) j++;
      const run = chromeQueue.slice(i, j);
      const maxPerRow = isLarge ? 3 : chromeMediumRowMax;
      const rowKind = isLarge
        ? ("large3" as const)
        : chromeMediumRowMax >= 3
          ? ("medium3" as const)
          : ("medium2" as const);
      for (let k = 0; k < run.length; k += maxPerRow) {
        const preparedList = run.slice(k, k + maxPerRow).map((x) => x.prepared);
        out.push({
          kind: "chromeSuiteRow",
          preparedList,
          rowKind,
          key: `chr-${rowKind}-${preparedList.map((p) => p.suite.suiteNorm).join("|")}`,
        });
      }
      i = j;
    }
    chromeQueue = [];
  };

  for (const suite of suiteGroups) {
    const chrome = suiteHasChrome(suite);
    if (!chrome) {
      flushChromeQueue();
      solos.push(suite);
      continue;
    }
    flushSolos();

    if (
      webBasementFacilityLayout &&
      isBasementFloorScopeTabKey(tabKey) &&
      suiteNormIsPowerStationExclusive(suite.suiteNorm, layoutRules)
    ) {
      flushChromeQueue();
      const preparedPs = prepareSuiteDisplay(suite, layoutRules);
      const bandPs = outerSuiteBand(preparedPs, suite);
      if (bandPs === "single") {
        out.push({ kind: "suite", prepared: preparedPs, key: `${tabKey}-${suite.suiteNorm}-pwr` });
      } else {
        out.push({
          kind: "chromeSuiteRow",
          preparedList: [preparedPs],
          rowKind: bandPs === "pairLarge" ? "large3" : "medium3",
          key: `chr-pwr-${tabKey}-${suite.suiteNorm}`,
        });
      }
      continue;
    }

    const prepared = prepareSuiteDisplay(suite, layoutRules);
    const band = outerSuiteBand(prepared, suite);

    if (band === "single") {
      flushChromeQueue();
      out.push({ kind: "suite", prepared, key: `${tabKey}-${suite.suiteNorm}` });
      continue;
    }

    const isLargeSuite = band === "pairLarge";
    if (chromeQueue.length > 0 && chromeQueue[chromeQueue.length - 1]!.isLargeSuite !== isLargeSuite) {
      flushChromeQueue();
    }
    chromeQueue.push({ prepared, isLargeSuite });
  }
  flushSolos();
  flushChromeQueue();
  return mergeConsecutiveSoloChunks(out);
}

/**
 * 顺序：楼层 tab →（仅地下室）E 区带（E10→E11A→E11B→E11C，房间编号硬匹配）→ 区内套间/单间 → 单间按三项/两项参数分桶。
 */
export function buildFloorChunks(
  tab: TelemetryStructuredFloorTab,
  options?: BuildFloorChunksOptions
): FloorChunk[] {
  const chromeMediumRowMax = options?.chromeMediumRowMax ?? 3;
  const webBasementFacilityLayout = options?.webBasementFacilityLayout ?? false;
  const layoutRules = options?.facilityLayoutRules ?? DEFAULT_FACILITY_LAYOUT_RULES_V1;
  const emitZoneBands = options?.emitZoneBands !== false;
  const blocks = orderedZoneBlocksFromSuiteGroups(tab.suiteGroups);
  const merged: FloorChunk[] = [];
  for (const { zoneKey, groups } of blocks) {
    if (emitZoneBands && zoneKey !== DEFAULT_PLANE_ZONE_KEY) {
      merged.push({
        kind: "zoneBand",
        zoneLabel: zoneKey,
        key: `zb-${tab.tabKey}-${zoneKey}`,
      });
    }
    merged.push(
      ...buildFloorChunksForSuiteSequence(
        tab.tabKey,
        groups,
        chromeMediumRowMax,
        webBasementFacilityLayout,
        layoutRules
      )
    );
  }
  return merged;
}
