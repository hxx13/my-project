import { isWinccLimitSuffixVariable } from "@/utils/telemetryWatchlistLimitNaming";
import { compareMetricsInFacilityRoom, facilityRoomCardIdentity } from "./facilityRoomGrouping";
import { DEFAULT_FACILITY_LAYOUT_RULES_V1, type FacilityLayoutRulesV1 } from "./facilityLayoutConfig";
import {
  basementSuiteRoomSegment,
  isSuiteConceptFloor,
  normalizeRoomForGrouping,
  standardSuiteRoomSegment,
} from "./roomGrouping";
import type {
  TelemetryStructuredFloorTab,
  TelemetryStructuredMetricSlot,
  TelemetryStructuredRoomCard,
  TelemetryStructuredSuiteGroup,
  TelemetryTagItem,
} from "./types";

function isStructuredLimitRole(kindRole: string | null | undefined): boolean {
  const u = (kindRole || "").trim().toUpperCase();
  return u === "LIMIT_MIN" || u === "LIMIT_MAX";
}

/**
 * 映射后多为「开关」；映射前常见「开关(读写值)(switch)」。全角括号参与匹配 (SWITCH)。
 * 变量名：*.Switch / *_Switch 等（避免误判 DISPATCH 等含 SWITCH 子串）。
 */
function textBlobSuggestsSwitch(
  metricKindLabel?: string | null,
  displayLabel?: string | null,
  variableName?: string | null
): boolean {
  const lb = (metricKindLabel || "").trim();
  const dl = (displayLabel || "").trim();
  if (lb.includes("开关") || dl.includes("开关")) return true;
  const blob = `${lb}\0${dl}`.replace(/（/g, "(").replace(/）/g, ")");
  if (blob.toUpperCase().includes("(SWITCH)")) return true;
  const vn = (variableName || "").trim();
  if (!vn.length) return false;
  const vu = vn.toUpperCase();
  if (vu.endsWith("_SWITCH") || vu.endsWith(".SWITCH")) return true;
  return (
    vu.includes("_SWITCH_") ||
    vu.includes(".SWITCH.") ||
    vu.includes("_SWITCH.") ||
    vu.includes(".SWITCH_")
  );
}

/**
 * UI / 排版：是否为开关类测点（与 Java AnimalRoomHubAssembler.metricSlotIsSwitch 对齐）。
 */
export function isSwitchTelemetryMetric(
  kindRole?: string | null,
  metricKindCode?: string | null,
  metricKindLabel?: string | null,
  displayLabel?: string | null,
  variableName?: string | null
): boolean {
  const kr = (kindRole || "").trim().toUpperCase();
  if (kr === "SWITCH") return true;
  const mk = (metricKindCode || "").trim().toUpperCase();
  if (mk === "SWITCH" || mk.includes("SWITCH")) return true;
  return textBlobSuggestsSwitch(metricKindLabel, displayLabel, variableName);
}

/** 状态类测量值：字典码 STATUS（kind_role 为 METRIC）；数值 1/0 展示为 开/关，非可写开关 */
export function isStatusTelemetryMetric(
  metricKindCode?: string | null,
  metricKindLabel?: string | null
): boolean {
  const mk = (metricKindCode || "").trim().toUpperCase();
  if (mk === "STATUS") return true;
  const lab = (metricKindLabel || "").trim();
  return lab === "状态";
}

/** 展示映射 displayLabel 去掉尾部「·状态 / -状态 / 状态」等，供无 roomCanonical 时兜底 */
function stripTrailingStatusFromDisplayLabel(displayLabel: string): string {
  let s = (displayLabel || "").trim();
  if (!s) return "";
  const patterns = [/[\u00b7\u2022\-_/\\]\s*状态\s*$/u, /\s*状态\s*$/u, /\bSTATUS\b\s*$/i];
  for (const p of patterns) {
    const next = s.replace(p, "").trim();
    if (next.length > 0 && next.length < s.length) s = next;
  }
  return s.trim();
}

/**
 * 状态类测点在房间卡片左侧展示名：用映射房间名（与卡片标题同源：stripLeadingSuitePrefixFromRoomDisplay(roomCanonical)），
 * 替代字典里的「状态」；与 Java AnimalRoomHubAssembler.statusMetricSlotDisplayLabel、小程序 statusMetricSlotDisplayLabelFromItemMp 对齐。
 */
export function statusMetricSlotDisplayLabel(item: TelemetryTagItem | null | undefined): string {
  if (!item) return "";
  const fromRc = stripLeadingSuitePrefixFromRoomDisplay(item.roomCanonical ?? "");
  if (fromRc) return fromRc;
  const fromDl = stripTrailingStatusFromDisplayLabel(item.displayLabel ?? "");
  if (fromDl) return fromDl;
  return "";
}

/** 将 WinCC 布尔式读数格式化为 开/关；无法识别时返回 null（调用方再退回常规小数格式） */
export function formatTelemetryStatusOnOff(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  const t = String(raw).trim();
  if (t === "—" || t === "\u2014" || t === "-") return null;
  const u = t.toLowerCase();
  if (u === "1" || u === "true" || u === "on") return "开";
  if (u === "0" || u === "false" || u === "off") return "关";
  const n = Number(t.replace(/,/g, "."));
  if (Number.isFinite(n)) {
    if (n === 1) return "开";
    if (n === 0) return "关";
  }
  return null;
}

/** @deprecated 优先用 {@link isSwitchTelemetryMetric}（含 code/标签/变量名） */
export function isSwitchKindRole(kindRole: string | null | undefined): boolean {
  return isSwitchTelemetryMetric(kindRole, null, null, null, null);
}

/** 具备楼层+房间+类别且非限值后缀（含 SWITCH，与其它指标一同进入套间规则） */
function hasStructuredFieldsForFloor(it: TelemetryTagItem): boolean {
  if (isWinccLimitSuffixVariable(it.variableName)) return false;
  if (isStructuredLimitRole(it.kindRole)) return false;
  return Boolean(
    (it.floorCode || "").trim() &&
      (it.roomCanonical || "").trim() &&
      (it.metricKindCode || "").trim()
  );
}

export function hasStructuredTelemetryItem(it: TelemetryTagItem): boolean {
  return hasStructuredFieldsForFloor(it);
}

/** 无 E 区可分时内部桶；不 emit zoneBand */
export const DEFAULT_PLANE_ZONE_KEY = "__default__";

/** 硬编码区码：匹配顺序先长后短（与 Java BASEMENT_HARD_ZONE_CODES 一致） */
const BASEMENT_HARD_ZONE_CODES = ["E11A", "E11B", "E11C", "E10"] as const;

/** B1F 平面区带顺序：E10→E11A→E11B→E11C；区内再按单间三项/两项参数分桶（与 AnimalRoomHubAssembler 一致） */
export const BASEMENT_E_PLANE_ZONE_DISPLAY_ORDER = ["E10", "E11A", "E11B", "E11C"] as const;

function segmentMatchesBasementHardZone(segmentUpper: string, zone: string): boolean {
  if (!segmentUpper.startsWith(zone)) return false;
  if (segmentUpper.length === zone.length) return true;
  const next = segmentUpper.charAt(zone.length);
  if (next === "-" || next === "_") return true;
  return !/\d/.test(next);
}

/** 仅依据房间规范编号分段匹配 E10 / E11A / E11B / E11C（不按展示标题推断） */
export function extractBasementHardZoneFromRoomCanonical(roomCanonical: string): string | null {
  const u = (roomCanonical || "").trim().toUpperCase();
  if (!u) return null;
  for (const segment of u.split(/[-_]/)) {
    if (!segment) continue;
    for (const zone of BASEMENT_HARD_ZONE_CODES) {
      if (segmentMatchesBasementHardZone(segment, zone)) return zone;
    }
  }
  return null;
}

/** 分页签：B1F/B2F 等地下室层（与 normalizeFloorTabKey 结果一致） */
export function isBasementFloorTabKey(tabKey: string): boolean {
  return /^B\d*F$/i.test((tabKey || "").trim());
}

export { isSuiteConceptFloor };

/**
 * 房间卡片标题：去掉 roomCanonical 前「套间· / 套间 ·」等前缀，仅展示房间名（与 Java 套间侧一致）。
 */
export function stripLeadingSuitePrefixFromRoomDisplay(roomCanonical: string): string {
  const s = (roomCanonical || "").trim();
  if (!s) return s;
  const stripped = s.replace(/^套间\s*[·•]\s*/u, "").trim();
  return stripped.length > 0 ? stripped : s;
}

/**
 * 套间块标题：去掉可能遗留的「套间」+ 可选 `·/•`（与多房归并键、旧缓存一致），仅展示名称。
 * 行首 `套间` 后无分隔符时也会剥掉并裁空白（如 `套间 MAU01`）。
 */
export function stripSuiteTitlePrefixForDisplay(title: string): string {
  const s = (title || "").trim();
  if (!s) return s;
  const stripped = s.replace(/^套间\s*(?:[·•]\s*)?/u, "").trim();
  return stripped.length > 0 ? stripped : s;
}

/**
 * @deprecated 语义已改为仅解析 `roomCanonical`；请优先用 {@link extractBasementHardZoneFromRoomCanonical}。
 * 保留导出名以免外部引用断裂；参数应传房间规范编号而非展示标题。
 */
export function extractBasementEPlaneCodeFromRoomTitle(roomCanonical: string): string | null {
  return extractBasementHardZoneFromRoomCanonical(roomCanonical);
}

/** 当前楼层标签下套间/卡所属 E 区分键；非地下室层一律 DEFAULT（不出现分区带） */
export function zoneKeyForFloorTab(tabKey: string, roomCanonical: string): string {
  if (!isBasementFloorTabKey(tabKey)) return DEFAULT_PLANE_ZONE_KEY;
  const z = extractBasementHardZoneFromRoomCanonical(roomCanonical);
  return z != null ? z.toUpperCase() : DEFAULT_PLANE_ZONE_KEY;
}

/** 展示用：能从房间规范编号解析出 E 区则返回，否则「其他」 */
export function extractZoneFromSoloTitle(roomCanonical: string): string {
  return extractBasementHardZoneFromRoomCanonical(roomCanonical) ?? "其他";
}

/** 分页签合并键：同一楼层不同 CSV 合并为一页（与 AnimalRoomHubAssembler.normalizeFloorTabKey 一致） */
export function normalizeFloorTabKey(floor: string): string {
  const s = floor.trim();
  if (!s) return s;
  const digitsOnly = s.match(/^(\d+)$/);
  if (digitsOnly) return `${digitsOnly[1]}F`;
  const cnLou = s.match(/^(\d+)\s*[层楼]\s*$/);
  if (cnLou) return `${cnLou[1]}F`;
  const lower = s.toLowerCase();
  const mNum = lower.match(/^(\d+)\s*f\s*$/);
  if (mNum) return `${mNum[1]}F`;
  const mB = lower.match(/^b(\d*)\s*f\s*$/);
  if (mB) return `B${mB[1] ?? ""}F`;
  const mM = lower.match(/^m(\d+)\s*f\s*$/);
  if (mM) return `M${mM[1]}F`;
  return s.toUpperCase();
}

/** 地下室 E 区带排序：固定 E10→E11A→E11B→E11C，其余字母序排在后 */
export function compareBasementPlaneZoneKeys(a: string, b: string): number {
  const rank = (x: string) => {
    if (x === DEFAULT_PLANE_ZONE_KEY) return -1;
    if (x === "其他") return 1;
    return 0;
  };
  const d = rank(a) - rank(b);
  if (d !== 0) return d;
  const order = BASEMENT_E_PLANE_ZONE_DISPLAY_ORDER;
  const ua = a.toUpperCase();
  const ub = b.toUpperCase();
  const ia = order.indexOf(ua as (typeof order)[number]);
  const ib = order.indexOf(ub as (typeof order)[number]);
  const ca = ia >= 0;
  const cb = ib >= 0;
  if (ca && cb) return ia - ib;
  if (ca) return -1;
  if (cb) return 1;
  return a.localeCompare(b, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}

function compareZoneKeys(a: string, b: string): number {
  return compareBasementPlaneZoneKeys(a, b);
}

function zoneSortKeyForSuite(suite: TelemetryStructuredSuiteGroup): string {
  const r0 = suite.rooms[0];
  if (!r0) return DEFAULT_PLANE_ZONE_KEY;
  return zoneKeyForFloorTab(suite.tabKey, r0.roomCanonical || "");
}

function totalMetricSlotsInSuite(rooms: TelemetryStructuredRoomCard[]): number {
  let n = 0;
  for (const r of rooms) n += r.metrics.length;
  return n;
}

function compareRoomsInSuiteForDisplay(
  a: TelemetryStructuredRoomCard,
  b: TelemetryStructuredRoomCard
): number {
  const d = b.metrics.length - a.metrics.length;
  if (d !== 0) return d;
  return a.roomCanonical.localeCompare(b.roomCanonical, "zh-CN", { numeric: true });
}

function compareSuiteGroupsForDisplay(
  a: TelemetryStructuredSuiteGroup,
  b: TelemetryStructuredSuiteGroup
): number {
  const dr = b.rooms.length - a.rooms.length;
  if (dr !== 0) return dr;
  const dt = totalMetricSlotsInSuite(b.rooms) - totalMetricSlotsInSuite(a.rooms);
  if (dt !== 0) return dt;
  return a.suiteNorm.localeCompare(b.suiteNorm, "zh-CN", { numeric: true });
}

function computeStructuredFloorTabKey(it: TelemetryTagItem): string | null {
  const floorRaw = (it.floorCode || "").trim();
  const rcRaw = (it.roomCanonical || "").trim();
  if (!floorRaw || !rcRaw) return null;
  const baseTabKey = normalizeFloorTabKey(floorRaw);
  let tabKey = baseTabKey;
  if (isBasementFloorTabKey(baseTabKey)) {
    const zone = extractBasementHardZoneFromRoomCanonical(rcRaw);
    if (zone != null) {
      tabKey = `${baseTabKey}-${zone.toUpperCase()}`;
    }
  }
  return tabKey;
}

/** 与 Hub structuredTabs tabKey 一致（含地下室 E 区分 tab） */
export function floorTabKeyForTelemetryItem(it: TelemetryTagItem): string | null {
  if (!hasStructuredFieldsForFloor(it)) return null;
  return computeStructuredFloorTabKey(it);
}

export function buildStructuredFloorTabs(
  items: TelemetryTagItem[] | null | undefined,
  facilityLayoutRules: FacilityLayoutRulesV1 = DEFAULT_FACILITY_LAYOUT_RULES_V1
): TelemetryStructuredFloorTab[] {
  const list = (items ?? []).filter(hasStructuredFieldsForFloor);
  if (!list.length) return [];
  type RoomMap = Map<string, TelemetryStructuredRoomCard>;
  type TabAcc = { floorCode: string; bundleCode: string; bundleTitle: string; suites: Map<string, RoomMap> };
  const tabs = new Map<string, TabAcc>();

  for (const it of list) {
    const floorRaw = it.floorCode!.trim();
    const rcRaw = it.roomCanonical!.trim();
    const baseTabKey = normalizeFloorTabKey(floorRaw);
    let tabKey = baseTabKey;
    if (isBasementFloorTabKey(baseTabKey)) {
      const zone = extractBasementHardZoneFromRoomCanonical(rcRaw);
      if (zone != null) {
        tabKey = `${baseTabKey}-${zone.toUpperCase()}`;
      }
    }
    const bc = (it.bundleCode || "").trim() || "_csv";
    const bt = (it.bundleDisplayName || "").trim() || bc;
    if (!tabs.has(tabKey)) {
      tabs.set(tabKey, { floorCode: tabKey, bundleCode: "_merged", bundleTitle: "", suites: new Map() });
    }
    const acc = tabs.get(tabKey)!;
    const suiteNorm = isSuiteConceptFloor(baseTabKey)
      ? normalizeRoomForGrouping(standardSuiteRoomSegment(rcRaw))
      : isBasementFloorTabKey(baseTabKey)
        ? normalizeRoomForGrouping(basementSuiteRoomSegment(rcRaw))
        : rcRaw.trim();
    if (!acc.suites.has(suiteNorm)) {
      acc.suites.set(suiteNorm, new Map());
    }
    const roomMap = acc.suites.get(suiteNorm)!;
    const cardRoomKey = facilityRoomCardIdentity(rcRaw, facilityLayoutRules);
    let card = roomMap.get(cardRoomKey);
    if (!card) {
      card = {
        tabKey,
        floorCode: acc.floorCode,
        bundleCode: bc,
        bundleTitle: bt,
        roomCanonical: cardRoomKey,
        sortKey: cardRoomKey,
        displayTitle: cardRoomKey,
        metrics: [],
      };
      roomMap.set(cardRoomKey, card);
    }
    const mkc = it.metricKindCode!.trim();
    const mkl = isStatusTelemetryMetric(mkc, it.metricKindLabel)
      ? statusMetricSlotDisplayLabel(it) || (it.metricKindLabel ?? it.metricKindCode)
      : (it.metricKindLabel ?? it.metricKindCode);
    card.metrics.push({
      metricKindCode: mkc,
      metricKindLabel: mkl,
      item: it,
    });
  }

  for (const acc of tabs.values()) {
    for (const roomMap of acc.suites.values()) {
      for (const card of roomMap.values()) {
        if (card.metrics.length > 1) {
          card.metrics.sort((a, b) => compareMetricsInFacilityRoom(a, b, facilityLayoutRules));
        }
      }
    }
  }

  const out: TelemetryStructuredFloorTab[] = [];
  for (const [tabKey, acc] of tabs) {
    const suiteNorms = Array.from(acc.suites.keys());
    const suiteGroups: TelemetryStructuredSuiteGroup[] = [];
    for (const suiteNorm of suiteNorms) {
      const roomMap = acc.suites.get(suiteNorm)!;
      const rooms = Array.from(roomMap.values())
        .filter((c) => c.metrics.length > 0)
        .map((c) => {
          c.displayTitle = stripLeadingSuitePrefixFromRoomDisplay(c.roomCanonical);
          return c;
        });
      if (!rooms.length) continue;
      rooms.sort(compareRoomsInSuiteForDisplay);
      /** 套间标题不再加「套间 ·」前缀；多房同一归并键时用归并键作标题 */
      const suiteTitle = stripSuiteTitlePrefixForDisplay(
        rooms.length > 1 ? suiteNorm : (rooms[0]?.displayTitle ?? suiteNorm),
      );
      suiteGroups.push({
        tabKey,
        floorCode: acc.floorCode,
        bundleCode: acc.bundleCode,
        bundleTitle: acc.bundleTitle,
        suiteNorm,
        suiteTitle,
        sortKey: suiteNorm,
        rooms,
      });
    }
    suiteGroups.sort((a, b) => {
      const dz = compareZoneKeys(zoneSortKeyForSuite(a), zoneSortKeyForSuite(b));
      if (dz !== 0) return dz;
      return compareSuiteGroupsForDisplay(a, b);
    });
    out.push({
      tabKey,
      title: acc.floorCode,
      floorCode: acc.floorCode,
      bundleCode: acc.bundleCode,
      bundleTitle: acc.bundleTitle,
      suiteGroups,
    });
  }
  out.sort((a, b) =>
    a.floorCode.localeCompare(b.floorCode, "zh-Hans-CN", { numeric: true, sensitivity: "base" })
  );
  return out;
}

export function countStructuredRoomsInTab(tab: TelemetryStructuredFloorTab): number {
  return tab.suiteGroups.reduce((n, s) => n + s.rooms.length, 0);
}
