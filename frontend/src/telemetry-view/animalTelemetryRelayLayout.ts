/**
 * 动物房温湿度双栏接力：列内套间与机房 Tab 一致——**单间（一张房间卡）无论几项参数，同一半行最多 3 套并排**；≥2 间独占半行；
 * **左右列分界**默认按各列 **pack 后估算视觉高度差最小** 在展平单元上切分（见 `balanceFloorUnits` / `balanceHubUnits`），**不是**按个数 ⌈n/2⌉。
 * 可选 `relaySplit: 'leftFirst'`：按顺序前 ⌈n/2⌉ 个单元在左列，且列内 **strictVertical**（每行只放一个接力单元、不三拼半行）。
 * `balance` 下列内允许半行三拼等 pack，与估算高度所用规则一致。
 * **`zoneBand` 在展平中转为 `zoneCard`**，与单间套间同属接力单元参与分列与列内 `pack`（半幅楼层/分区标识，夹在机组之间）。
 * **机房 Tab**（`ANIMAL_ROOM_HVAC_TAB_KEY`）：`zoneCard` **独占一行**；且不得被半行组「跟在套间后」拼进同一行（`machineRoomZoneRowBreak`，如 B1F 末台 AHU 与下一分区 E11B 标签）。
 * **solos 接力单元每块 ≤3 张卡**，避免整块「单间区」被迫挤在单列导致左低右高。
 * **2F/3F「单间 · 三项参数」**：自 **206A / 306A** 起及其后的**全部**展平接力单元（含两项单间、套间等）固定在**右栏自顶向下**；锚点前的单元全部在**左栏**（该规则优先于上述按高度切分）。
 */

import type { AnimalRoomHubViewChunk } from "../api/telemetryApi";
import { ANIMAL_ROOM_HVAC_TAB_KEY } from "./animalTelemetryHvacUnits";
import type { FloorChunk, PreparedSuite } from "./floorChunks";
import { isBasementFloorTabKey } from "./structuredTabs";
import type { TelemetryStructuredMetricSlot, TelemetryStructuredRoomCard } from "./types";

function isAnimalRoomMachineRoomTabKey(tabKey: string | undefined): boolean {
  return (tabKey ?? "").trim() === ANIMAL_ROOM_HVAC_TAB_KEY;
}

function metricSlotIsSetpoint(slot: TelemetryStructuredMetricSlot): boolean {
  const kr = (slot.item?.kindRole || "").trim().toUpperCase();
  const mk = (slot.metricKindCode || "").trim().toUpperCase();
  return kr === "SETPOINT" || mk === "SETPOINT";
}

/** 标题槽 + 各房间指标中含设定值的数量（用于列平衡权重等，不参与「独占半行」判定） */
export function countSetpointParamsInPreparedSuite(prepared: PreparedSuite): number {
  let n = 0;
  for (const s of prepared.titleSlots ?? []) {
    if (metricSlotIsSetpoint(s)) n++;
  }
  for (const room of prepared.visibleRooms ?? []) {
    for (const m of room.metrics ?? []) {
      if (metricSlotIsSetpoint(m)) n++;
    }
  }
  return n;
}

export function visibleRoomCountInPreparedSuite(prepared: PreparedSuite): number {
  return (prepared.visibleRooms ?? []).filter(Boolean).length;
}

/**
 * 独占半行宽度：≥2 间可见、或 0 间异常。单间（1 间）无论标题槽/房间几项参数，均不占「独占」语义，可与同列最多另外两套并排（共 ≤3）。
 */
export function preparedSuiteWantsFullWidthRow(prepared: PreparedSuite): boolean {
  const vr = visibleRoomCountInPreparedSuite(prepared);
  if (vr === 0) return true;
  return vr >= 2;
}

/** 双栏分列时的相对「视觉高度」权重，供 balance* 最小化左右累计差 */
function suitePreparedBalanceWeight(prepared: PreparedSuite): number {
  const vr = visibleRoomCountInPreparedSuite(prepared);
  const sp = countSetpointParamsInPreparedSuite(prepared);
  let w = 1.2 + vr * 1.15 + sp * 0.4;
  if (preparedSuiteWantsFullWidthRow(prepared)) w += 3.2;
  const slots = (prepared.titleSlots ?? []).length;
  w += Math.min(4, slots) * 0.25;
  return Math.round(w * 10) / 10;
}

function hubChunkIsSolos(ch: AnimalRoomHubViewChunk): boolean {
  return ch.kind === "solos" && Boolean(ch.partitions?.length);
}

/** Hub solos：每接力单元最多 3 张单间卡（与半栏三列一致），便于左右分列拉齐高度 */
const HUB_SOLO_RELAY_MAX_CARDS_PER_UNIT = 3;

function hubSoloRelayCardCount(ch: AnimalRoomHubViewChunk): number {
  let n = 0;
  for (const p of ch.partitions ?? []) {
    for (const row of p.rows ?? []) {
      n += row.cards?.length ?? 0;
    }
  }
  return n;
}

/** 将服务端 solos partition 拆成每块 ≤3 张卡片的 viewChunk，供双栏分列拉齐累计视觉行高 */
function pushHubSoloRelayUnitsFromChunk(out: AnimalRoomHubViewChunk[], ch: AnimalRoomHubViewChunk): void {
  const parts = ch.partitions ?? [];
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi]!;
    const rows = part.rows ?? [];
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const cards = row.cards ?? [];
      if (cards.length === 0) continue;
      for (let ci = 0; ci < cards.length; ci += HUB_SOLO_RELAY_MAX_CARDS_PER_UNIT) {
        const slice = cards.slice(ci, ci + HUB_SOLO_RELAY_MAX_CARDS_PER_UNIT);
        const showHeader = ci === 0;
        out.push({
          kind: "solos",
          key: `${ch.key}-relay-p${pi}-r${ri}-c${ci}`,
          partitions: [
            {
              label: showHeader ? part.label : "",
              zoneSub: showHeader ? part.zoneSub ?? undefined : undefined,
              rows: [{ cards: slice }],
            },
          ],
        } as AnimalRoomHubViewChunk);
      }
    }
  }
}

function hubChunkIsMicroChromeRow(ch: AnimalRoomHubViewChunk): boolean {
  if (ch.kind !== "chromeSuiteRow" || !ch.list?.length) return false;
  const cell = ch.list[0];
  return Boolean(cell?.webSoloMicroGrid?.filter(Boolean).length);
}

/** 用于左右列高度平衡（相对权重） */
export function hubChunkBalanceWeight(ch: AnimalRoomHubViewChunk): number {
  if (hubChunkIsZoneCard(ch)) return 0.75;
  if (hubChunkIsSolos(ch)) {
    const c = hubSoloRelayCardCount(ch);
    return Math.round(Math.max(2.5, Math.min(22, 2 + c * 0.42)) * 10) / 10;
  }
  if (hubChunkIsMicroChromeRow(ch)) return 6;
  if (ch.kind === "suite" && ch.prepared) {
    return suitePreparedBalanceWeight(ch.prepared);
  }
  if (ch.kind === "chromeSuiteRow" && ch.list?.length) {
    let sum = 2.2;
    for (const cell of ch.list) {
      if (cell.prepared) sum += suitePreparedBalanceWeight(cell.prepared) * 0.55;
      for (const p of cell.webSidecarPreparedSuites ?? []) {
        if (p) sum += suitePreparedBalanceWeight(p) * 0.5;
      }
      sum += (cell.webSoloMicroGrid?.filter(Boolean).length ?? 0) * 0.85;
    }
    return Math.min(26, Math.round(sum * 10) / 10);
  }
  return 1;
}

/** 分区标识卡：与单间套间一样参与半行三拼（非 strictVertical 时） */
export function hubChunkIsZoneCard(ch: AnimalRoomHubViewChunk): boolean {
  return ch.kind === "zoneCard";
}

/** 可与其它单间套间同一半行并排（最多 3 个）：非 solos、非微网格 chrome、且恰 1 间可见房间（参数数量不限） */
export function hubChunkCanPairHalfRowWithSuite(ch: AnimalRoomHubViewChunk): boolean {
  if (ch.kind !== "suite" || !ch.prepared) return false;
  return visibleRoomCountInPreparedSuite(ch.prepared) === 1;
}

function hubChunkCanHalfRowPackWithPeers(ch: AnimalRoomHubViewChunk): boolean {
  return hubChunkIsZoneCard(ch) || hubChunkCanPairHalfRowWithSuite(ch);
}

/** {@link packHubChunksIntoRows} / {@link packFloorChunksIntoRows} 可选参数 */
export type PackRelayColumnChunksOptions = {
  /** 为 true 时每个接力单元独占一行（列内纵向），不把小单间套间三拼横排 */
  strictVertical?: boolean;
  /**
   * 机房 Tab：`zoneCard` 独占一行，不与单间套间半行并排（分页楼层标签换行，不与套间同一行）。
   */
  machineRoomZoneRowBreak?: boolean;
};

export function packHubChunksIntoRows(
  chunks: AnimalRoomHubViewChunk[],
  options?: PackRelayColumnChunksOptions
): AnimalRoomHubViewChunk[][] {
  if (options?.strictVertical === true) {
    return chunks.map((ch) => [ch]);
  }
  const rows: AnimalRoomHubViewChunk[][] = [];
  let i = 0;
  while (i < chunks.length) {
    const ch = chunks[i];
    if (hubChunkIsSolos(ch) || hubChunkIsMicroChromeRow(ch) || (ch.kind === "suite" && ch.prepared && preparedSuiteWantsFullWidthRow(ch.prepared))) {
      rows.push([ch]);
      i++;
      continue;
    }
    if (options?.machineRoomZoneRowBreak === true && hubChunkIsZoneCard(ch)) {
      rows.push([ch]);
      i++;
      continue;
    }
    if (hubChunkCanHalfRowPackWithPeers(ch)) {
      const group: AnimalRoomHubViewChunk[] = [ch];
      let j = i + 1;
      while (j < chunks.length && group.length < 3) {
        const next = chunks[j];
        /** 机房 Tab：分区标签不得被半行组「跟在套间后」拼进同一行（如 B1F 末台 AHU 与下一分区 zoneCard） */
        if (options?.machineRoomZoneRowBreak === true && hubChunkIsZoneCard(next)) break;
        if (!hubChunkCanHalfRowPackWithPeers(next)) break;
        group.push(next);
        j++;
      }
      rows.push(group);
      i = j;
      continue;
    }
    rows.push([ch]);
    i++;
  }
  return rows;
}

/** 单列 pack 后一行在页面上的相对高度（与 solos 三列网格行高对齐的量纲） */
function hubPackedRowVisualHeight(row: AnimalRoomHubViewChunk[]): number {
  if (!row.length) return 0;
  if (row.length > 1) {
    if (row.every((c) => hubChunkIsZoneCard(c))) return 0.55;
    return 1;
  }
  const ch = row[0]!;
  if (hubChunkIsZoneCard(ch)) return 0.55;
  if (hubChunkIsSolos(ch)) {
    const c = hubSoloRelayCardCount(ch);
    return Math.max(1, Math.ceil(c / 3));
  }
  if (hubChunkIsMicroChromeRow(ch)) return 1.25;
  if (ch.kind === "suite" && ch.prepared) {
    if (preparedSuiteWantsFullWidthRow(ch.prepared)) {
      const w = suitePreparedBalanceWeight(ch.prepared);
      return Math.max(1.35, Math.min(5.5, w / 2.8));
    }
    return 1;
  }
  if (ch.kind === "chromeSuiteRow" && ch.list?.length) {
    let h = 0.9;
    for (const cell of ch.list) {
      if ((cell.webSoloMicroGrid?.filter(Boolean).length ?? 0) > 0) {
        h += 1.1;
        continue;
      }
      if (cell.prepared) {
        h += preparedSuiteWantsFullWidthRow(cell.prepared)
          ? Math.max(1.2, Math.min(4, suitePreparedBalanceWeight(cell.prepared) / 3))
          : 0.85;
      }
      for (const p of cell.webSidecarPreparedSuites ?? []) {
        if (p) h += Math.max(0.9, Math.min(3, suitePreparedBalanceWeight(p) / 3.5));
      }
    }
    return Math.max(1.2, Math.min(6, h));
  }
  return 1;
}

function hubPackedColumnVisualHeight(packed: AnimalRoomHubViewChunk[][]): number {
  let s = 0;
  for (const r of packed) s += hubPackedRowVisualHeight(r);
  return Math.round(s * 100) / 100;
}

function floorSoloRelayCardCount(ch: Extract<FloorChunk, { kind: "solos" }>): number {
  let n = 0;
  for (const p of ch.partitions ?? []) {
    n += p.cards?.length ?? 0;
  }
  return n;
}

/** 结构化楼层 solos：每块 ≤3 张卡，与 Hub 一致便于分列对齐 */
const FLOOR_SOLO_RELAY_MAX_CARDS_PER_UNIT = 3;

export function floorChunkBalanceWeight(ch: FloorChunk): number {
  if (floorChunkIsZoneCard(ch)) return 0.75;
  if (ch.kind === "solos") {
    const c = floorSoloRelayCardCount(ch);
    return Math.round(Math.max(2.5, Math.min(22, 2 + c * 0.42)) * 10) / 10;
  }
  if (ch.kind === "suite") {
    return suitePreparedBalanceWeight(ch.prepared);
  }
  if (ch.kind === "chromeSuiteRow" && ch.preparedList?.length) {
    let sum = 2.2;
    for (const p of ch.preparedList) {
      sum += suitePreparedBalanceWeight(p) * 0.58;
    }
    return Math.min(24, Math.round(sum * 10) / 10);
  }
  return 1;
}

/** 可与其它单间套间同一半行并排（最多 3 个） */
export function floorChunkCanPairHalfRowWithSuite(ch: FloorChunk): boolean {
  if (ch.kind !== "suite") return false;
  return visibleRoomCountInPreparedSuite(ch.prepared) === 1;
}

export function floorChunkIsZoneCard(ch: FloorChunk): boolean {
  return ch.kind === "zoneCard";
}

function floorChunkCanHalfRowPackWithPeers(ch: FloorChunk): boolean {
  return floorChunkIsZoneCard(ch) || floorChunkCanPairHalfRowWithSuite(ch);
}

export function packFloorChunksIntoRows(
  chunks: FloorChunk[],
  options?: PackRelayColumnChunksOptions
): FloorChunk[][] {
  if (options?.strictVertical === true) {
    return chunks.map((ch) => [ch]);
  }
  const rows: FloorChunk[][] = [];
  let i = 0;
  while (i < chunks.length) {
    const ch = chunks[i];
    if (ch.kind === "solos" || ch.kind === "chromeSuiteRow" || (ch.kind === "suite" && preparedSuiteWantsFullWidthRow(ch.prepared))) {
      rows.push([ch]);
      i++;
      continue;
    }
    if (options?.machineRoomZoneRowBreak === true && floorChunkIsZoneCard(ch)) {
      rows.push([ch]);
      i++;
      continue;
    }
    if (floorChunkCanHalfRowPackWithPeers(ch)) {
      const group: FloorChunk[] = [ch];
      let j = i + 1;
      while (j < chunks.length && group.length < 3) {
        const next = chunks[j];
        if (options?.machineRoomZoneRowBreak === true && floorChunkIsZoneCard(next)) break;
        if (!floorChunkCanHalfRowPackWithPeers(next)) break;
        group.push(next);
        j++;
      }
      rows.push(group);
      i = j;
      continue;
    }
    rows.push([ch]);
    i++;
  }
  return rows;
}

function floorPackedRowVisualHeight(row: FloorChunk[]): number {
  if (!row.length) return 0;
  if (row.length > 1) {
    if (row.every((c) => floorChunkIsZoneCard(c))) return 0.55;
    return 1;
  }
  const ch = row[0]!;
  if (floorChunkIsZoneCard(ch)) return 0.55;
  if (ch.kind === "solos") {
    const c = floorSoloRelayCardCount(ch);
    return Math.max(1, Math.ceil(c / 3));
  }
  if (ch.kind === "chromeSuiteRow") {
    const w = floorChunkBalanceWeight(ch);
    return Math.max(1.2, Math.min(5.5, w / 3));
  }
  if (ch.kind === "suite") {
    if (preparedSuiteWantsFullWidthRow(ch.prepared)) {
      const w = suitePreparedBalanceWeight(ch.prepared);
      return Math.max(1.35, Math.min(5.5, w / 2.8));
    }
    return 1;
  }
  return 1;
}

function floorPackedColumnVisualHeight(packed: FloorChunk[][]): number {
  let s = 0;
  for (const r of packed) s += floorPackedRowVisualHeight(r);
  return Math.round(s * 100) / 100;
}

function sumHubBalanceWeights(list: AnimalRoomHubViewChunk[]): number {
  return list.reduce((s, u) => s + hubChunkBalanceWeight(u), 0);
}

/** 双栏接力（仅 `relaySplit: 'leftFirst'`）：保持展平顺序，左列放前 ⌈n/2⌉ 个单元，余下在右列；非产品主策略，见 `balance*` */
function splitFlatRelayUnitsLeftFirst<T>(flat: readonly T[]): { left: T[]; right: T[] } {
  const n = flat.length;
  if (n === 0) return { left: [], right: [] };
  if (n === 1) return { left: [...flat], right: [] };
  const k = Math.ceil(n / 2);
  return { left: flat.slice(0, k) as T[], right: flat.slice(k) as T[] };
}

/**
 * 左列 flat[0..k)、右列 flat[k..)；优先最小化 pack 后**估算视觉高度**差，其次行数差、权重差（同差时 k 偏大）。
 * 默认 Hub 双栏分列：在展平单元上枚举切分点，使左右列 **pack 后估算视觉高度差** 最小（与 ⌈n/2⌉ 无关）。
 */
function balanceHubUnits(
  units: AnimalRoomHubViewChunk[],
  packOpts?: PackRelayColumnChunksOptions
): { left: AnimalRoomHubViewChunk[]; right: AnimalRoomHubViewChunk[] } {
  const n = units.length;
  if (n === 0) return { left: [], right: [] };
  if (n === 1) return { left: units, right: [] };
  let bestK = 1;
  let bestHDiff = Infinity;
  let bestRowDiff = Infinity;
  let bestWDiff = Infinity;
  for (let k = 1; k < n; k++) {
    const left = units.slice(0, k);
    const right = units.slice(k);
    const pl = packHubChunksIntoRows(left, packOpts);
    const pr = packHubChunksIntoRows(right, packOpts);
    const hDiff = Math.abs(hubPackedColumnVisualHeight(pl) - hubPackedColumnVisualHeight(pr));
    const rowDiff = Math.abs(pl.length - pr.length);
    const wDiff = Math.abs(sumHubBalanceWeights(left) - sumHubBalanceWeights(right));
    if (
      hDiff < bestHDiff ||
      (hDiff === bestHDiff &&
        (rowDiff < bestRowDiff ||
          (rowDiff === bestRowDiff && (wDiff < bestWDiff || (wDiff === bestWDiff && k > bestK)))))
    ) {
      bestHDiff = hDiff;
      bestRowDiff = rowDiff;
      bestWDiff = wDiff;
      bestK = k;
    }
  }
  return { left: units.slice(0, bestK), right: units.slice(bestK) };
}

function sumFloorBalanceWeights(list: FloorChunk[]): number {
  return list.reduce((s, u) => s + floorChunkBalanceWeight(u), 0);
}

/** 默认结构化楼层双栏分列：同 {@link balanceHubUnits}，按左右列 pack 后估算视觉高度差最小切分。 */
function balanceFloorUnits(
  units: FloorChunk[],
  packOpts?: PackRelayColumnChunksOptions
): { left: FloorChunk[]; right: FloorChunk[] } {
  const n = units.length;
  if (n === 0) return { left: [], right: [] };
  if (n === 1) return { left: units, right: [] };
  let bestK = 1;
  let bestHDiff = Infinity;
  let bestRowDiff = Infinity;
  let bestWDiff = Infinity;
  for (let k = 1; k < n; k++) {
    const left = units.slice(0, k);
    const right = units.slice(k);
    const pl = packFloorChunksIntoRows(left, packOpts);
    const pr = packFloorChunksIntoRows(right, packOpts);
    const hDiff = Math.abs(floorPackedColumnVisualHeight(pl) - floorPackedColumnVisualHeight(pr));
    const rowDiff = Math.abs(pl.length - pr.length);
    const wDiff = Math.abs(sumFloorBalanceWeights(left) - sumFloorBalanceWeights(right));
    if (
      hDiff < bestHDiff ||
      (hDiff === bestHDiff &&
        (rowDiff < bestRowDiff ||
          (rowDiff === bestRowDiff && (wDiff < bestWDiff || (wDiff === bestWDiff && k > bestK)))))
    ) {
      bestHDiff = hDiff;
      bestRowDiff = rowDiff;
      bestWDiff = wDiff;
      bestK = k;
    }
  }
  return { left: units.slice(0, bestK), right: units.slice(bestK) };
}

/**
 * 将「同一区域带之间」的 chunks 摊成纵向优先级序列（与 HubFloorContent 单格语义一致）。
 */
export function flattenHubSegmentToRelayOrder(segment: AnimalRoomHubViewChunk[]): AnimalRoomHubViewChunk[] {
  const out: AnimalRoomHubViewChunk[] = [];
  for (const ch of segment) {
    if (ch.kind === "zoneBand") {
      out.push({
        kind: "zoneCard",
        key: ch.key || `zc-${out.length}`,
        zoneLabel: (ch.zoneLabel ?? "—") as string,
      } as AnimalRoomHubViewChunk);
      continue;
    }
    if (hubChunkIsZoneCard(ch)) {
      out.push(ch);
      continue;
    }
    if (ch.kind === "suite" && ch.prepared) {
      out.push(ch);
      continue;
    }
    if (ch.kind === "chromeSuiteRow" && ch.list?.length) {
      ch.list.forEach((cell, cellIdx) => {
        const micro = cell.webSoloMicroGrid?.filter(Boolean) ?? [];
        const sidePrep = cell.webSidecarPreparedSuites?.filter(Boolean) ?? [];
        if (micro.length > 0) {
          out.push({ ...ch, key: `${ch.key}-relay-${cellIdx}-m`, list: [cell] });
          return;
        }
        if (sidePrep.length > 0) {
          for (let si = 0; si < sidePrep.length; si++) {
            const ps = sidePrep[si];
            out.push({
              kind: "suite",
              key: `${ch.key}-relay-${cellIdx}-s${si}`,
              prepared: ps,
            } as AnimalRoomHubViewChunk);
          }
          return;
        }
        if (cell.prepared) {
          out.push({
            kind: "suite",
            key: `${ch.key}-relay-${cellIdx}-p`,
            prepared: cell.prepared,
          } as AnimalRoomHubViewChunk);
        }
      });
      continue;
    }
    if (ch.kind === "solos" && ch.partitions?.length) {
      pushHubSoloRelayUnitsFromChunk(out, ch);
      continue;
    }
    if (ch.kind === "solos") {
      out.push(ch);
    }
  }
  return out;
}

/** 2F→206A、3F→306A：用于「单间 · 三项参数」在双栏接力中从右栏顶起排的分界房间（非单卡缩进） */
export function floorTripleRelayRightColumnAnchorByTabKey(tabKey: string): string | null {
  const tk = (tabKey || "").trim();
  if (!tk || isBasementFloorTabKey(tk)) return null;
  if (/(?:^|[\s_\-])2F(?:$|[\s_\-])/i.test(tk)) return "206A";
  if (/(?:^|[\s_\-])3F(?:$|[\s_\-])/i.test(tk)) return "306A";
  return null;
}

function roomCardMatchesTripleRelayAnchor(card: TelemetryStructuredRoomCard, anchor: string): boolean {
  const a = anchor.trim();
  if (!a) return false;
  const canon = (card.roomCanonical || "").trim();
  const disp = (card.displayTitle || "").trim();
  return canon.includes(a) || disp.includes(a);
}

function flattenFloorSegmentToRelayOrderInner(
  segment: FloorChunk[],
  tabKey?: string
): { flat: FloorChunk[]; relayRightColumnStartIndex: number | null } {
  const out: FloorChunk[] = [];
  let relayRightColumnStartIndex: number | null = null;
  const anchor = tabKey ? floorTripleRelayRightColumnAnchorByTabKey(tabKey) : null;

  for (const ch of segment) {
    if (ch.kind === "zoneBand") {
      out.push({
        kind: "zoneCard",
        key: ch.key,
        zoneLabel: ch.zoneLabel,
      });
      continue;
    }
    if (ch.kind === "zoneCard") {
      out.push(ch);
      continue;
    }
    if (ch.kind === "suite") {
      out.push(ch);
      continue;
    }
    if (ch.kind === "chromeSuiteRow") {
      for (let i = 0; i < ch.preparedList.length; i++) {
        out.push({
          kind: "suite",
          prepared: ch.preparedList[i],
          key: `${ch.key}-relay-${i}`,
        });
      }
      continue;
    }
    if (ch.kind === "solos" && ch.partitions?.length) {
      for (let pi = 0; pi < ch.partitions.length; pi++) {
        const part = ch.partitions[pi];
        const cards = part.cards ?? [];
        if (!cards.length) continue;

        const pushSlices = (
          sliceCards: TelemetryStructuredRoomCard[],
          keyPrefix: string,
          opts: { firstLabel: string; firstZoneSub?: string }
        ) => {
          for (let bi = 0; bi < sliceCards.length; bi += FLOOR_SOLO_RELAY_MAX_CARDS_PER_UNIT) {
            const slice = sliceCards.slice(bi, bi + FLOOR_SOLO_RELAY_MAX_CARDS_PER_UNIT);
            const p: (typeof ch.partitions)[number] = {
              label: bi === 0 ? opts.firstLabel : "",
              cards: slice,
            };
            if (bi === 0 && opts.firstZoneSub != null && String(opts.firstZoneSub).trim() !== "") {
              p.zoneSub = opts.firstZoneSub;
            }
            out.push({
              kind: "solos",
              key: `${keyPrefix}-b${bi}`,
              partitions: [p],
            });
          }
        };

        if (anchor && part.label === "单间 · 三项参数") {
          const splitIdx = cards.findIndex((c) => roomCardMatchesTripleRelayAnchor(c, anchor));
          if (splitIdx < 0) {
            pushSlices(cards, `${ch.key}-relay-p${pi}`, {
              firstLabel: part.label,
              firstZoneSub: part.zoneSub,
            });
          } else {
            const before = cards.slice(0, splitIdx);
            const from = cards.slice(splitIdx);
            if (before.length) {
              pushSlices(before, `${ch.key}-relay-p${pi}-pre`, {
                firstLabel: part.label,
                firstZoneSub: part.zoneSub,
              });
            }
            if (from.length) {
              if (relayRightColumnStartIndex == null) relayRightColumnStartIndex = out.length;
              pushSlices(from, `${ch.key}-relay-p${pi}-post`, {
                firstLabel: before.length === 0 ? part.label : "",
                firstZoneSub: before.length === 0 ? part.zoneSub : undefined,
              });
            }
          }
          continue;
        }

        for (let bi = 0; bi < cards.length; bi += FLOOR_SOLO_RELAY_MAX_CARDS_PER_UNIT) {
          const slice = cards.slice(bi, bi + FLOOR_SOLO_RELAY_MAX_CARDS_PER_UNIT);
          const p: (typeof ch.partitions)[number] = {
            label: bi === 0 ? part.label : "",
            cards: slice,
          };
          if (bi === 0 && part.zoneSub != null && String(part.zoneSub).trim() !== "") {
            p.zoneSub = part.zoneSub;
          }
          out.push({
            kind: "solos",
            key: `${ch.key}-relay-p${pi}-b${bi}`,
            partitions: [p],
          });
        }
      }
      continue;
    }
    if (ch.kind === "solos") {
      out.push(ch);
    }
  }
  return { flat: out, relayRightColumnStartIndex };
}

/** 可选 `tabKey`：2F/3F 单间三项在 206A/306A 后右栏接力，见 {@link flattenFloorSegmentToRelayOrderInner} */
export function flattenFloorSegmentToRelayOrder(segment: FloorChunk[], tabKey?: string): FloorChunk[] {
  return flattenFloorSegmentToRelayOrderInner(segment, tabKey).flat;
}

export type AnimalRoomHubRelayRow = {
  kind: "relay";
  key: string;
  leftRows: AnimalRoomHubViewChunk[][];
  rightRows: AnimalRoomHubViewChunk[][];
};

/** {@link buildAnimalRoomHubRelayRows} 可选参数 */
export type BuildAnimalRoomHubRelayRowsOptions = {
  /**
   * `balance`（默认）：按左右列 **pack 后估算视觉高度差最小** 切分展平单元。
   * `leftFirst`：按顺序前 ⌈n/2⌉ 个在左列，列内 `strictVertical`（兼容旧行为）。
   */
  relaySplit?: "leftFirst" | "balance";
  /** 当前 Tab；机房 Tab 时 `zoneCard` 独占一行，不与套间半行并排 */
  tabKey?: string;
};

export function buildAnimalRoomHubRelayRows(
  chunks: AnimalRoomHubViewChunk[],
  options?: BuildAnimalRoomHubRelayRowsOptions
): AnimalRoomHubRelayRow[] {
  const rows: AnimalRoomHubRelayRow[] = [];
  let segment: AnimalRoomHubViewChunk[] = [];
  let segIdx = 0;

  const flushSegment = () => {
    if (!segment.length) return;
    const flat = flattenHubSegmentToRelayOrder(segment);
    segment = [];
    if (!flat.length) return;
    const relaySplit = options?.relaySplit ?? "balance";
    const machineRoomZoneRowBreak = options?.tabKey === ANIMAL_ROOM_HVAC_TAB_KEY;
    const packOpts: PackRelayColumnChunksOptions = {
      strictVertical: relaySplit === "leftFirst",
      machineRoomZoneRowBreak,
    };
    const { left, right } =
      relaySplit === "balance" ? balanceHubUnits(flat, packOpts) : splitFlatRelayUnitsLeftFirst(flat);
    const leftRows = packHubChunksIntoRows(left, packOpts);
    const rightRows = packHubChunksIntoRows(right, packOpts);
    rows.push({ kind: "relay", key: `hub-relay-${segIdx++}`, leftRows, rightRows });
  };

  for (const ch of chunks) {
    segment.push(ch);
  }
  flushSegment();
  return rows;
}

export type AnimalRoomFloorRelayRow = {
  kind: "relay";
  key: string;
  leftRows: FloorChunk[][];
  rightRows: FloorChunk[][];
};

/** {@link buildAnimalRoomFloorRelayRows} 可选参数 */
export type BuildAnimalRoomFloorRelayRowsOptions = {
  /**
   * 同 {@link BuildAnimalRoomHubRelayRowsOptions.relaySplit}：`balance`（默认）按列估算高度差最小；
   * `leftFirst` 为顺序 ⌈n/2⌉ + 列内 strictVertical。
   */
  relaySplit?: "leftFirst" | "balance";
  /** 与结构化楼层 tab 一致；用于 2F/3F 单间三项在 206A/306A 起右栏顶排 */
  tabKey?: string;
};

export function buildAnimalRoomFloorRelayRows(
  chunks: FloorChunk[],
  options?: BuildAnimalRoomFloorRelayRowsOptions
): AnimalRoomFloorRelayRow[] {
  const rows: AnimalRoomFloorRelayRow[] = [];
  let segment: FloorChunk[] = [];
  let segIdx = 0;

  const flushSegment = () => {
    if (!segment.length) return;
    const { flat, relayRightColumnStartIndex } = flattenFloorSegmentToRelayOrderInner(
      segment,
      options?.tabKey
    );
    segment = [];
    if (!flat.length) return;
    const relaySplit = options?.relaySplit ?? "balance";
    const machineRoomZoneRowBreak = isAnimalRoomMachineRoomTabKey(options?.tabKey);
    const packOpts: PackRelayColumnChunksOptions = {
      strictVertical: relaySplit === "leftFirst",
      machineRoomZoneRowBreak,
    };
    let left: FloorChunk[];
    let right: FloorChunk[];
    if (relayRightColumnStartIndex != null && relayRightColumnStartIndex < flat.length) {
      left = flat.slice(0, relayRightColumnStartIndex);
      right = flat.slice(relayRightColumnStartIndex);
    } else if (relaySplit === "balance") {
      const split = balanceFloorUnits(flat, packOpts);
      left = split.left;
      right = split.right;
    } else {
      const split = splitFlatRelayUnitsLeftFirst(flat);
      left = split.left;
      right = split.right;
    }
    rows.push({
      kind: "relay",
      key: `floor-relay-${segIdx++}`,
      leftRows: packFloorChunksIntoRows(left, packOpts),
      rightRows: packFloorChunksIntoRows(right, packOpts),
    });
  };

  for (const ch of chunks) {
    segment.push(ch);
  }
  flushSegment();
  return rows;
}
