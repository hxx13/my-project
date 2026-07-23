/**
 * 最后一个 `-` 后片段（地下室等路径）；无 `-` 则整段。
 * 标准层套间分组勿用此作房间码：见 {@link standardSuiteRoomSegment}。
 */
export function localPartRoomCanonical(roomCanonical: string): string {
  const r = (roomCanonical || "").trim();
  if (!r) return r;
  const dash = r.lastIndexOf("-");
  if (dash >= 0) return r.slice(dash + 1).trim();
  return r;
}

/**
 * 地上标准层（分页签 {@code \\d+F}，任意层高）套间分组：可选楼层前缀后的第一段房间码。
 * 例：`1F-102B-兔饲养室-温度` → `102B`。仅由 {@link isSuiteConceptFloor} 为真时调用。
 */
const LEADING_FLOOR_TOKEN = /^(?:\d+F|B\d*F|M\d+F)$/i;

/** 与 Java BASEMENT_HARD_ZONE_CODES 顺序一致：先长后短匹配 */
const BASEMENT_HARD_ZONE_CODES_RG = ["E11A", "E11B", "E11C", "E10"] as const;

function segmentMatchesBasementHardZoneRg(segmentUpper: string, zone: string): boolean {
  if (!segmentUpper.startsWith(zone)) return false;
  if (segmentUpper.length === zone.length) return true;
  const next = segmentUpper.charAt(zone.length);
  if (next === "-" || next === "_") return true;
  return !/\d/.test(next);
}

function basementHardZoneFromSingleSegmentRg(segment: string): string | null {
  const u = segment.trim().toUpperCase();
  if (!u) return null;
  for (const zone of BASEMENT_HARD_ZONE_CODES_RG) {
    if (segmentMatchesBasementHardZoneRg(u, zone)) return zone;
  }
  return null;
}

/** 地上标准层分页签（纯数字+F）：套间按末尾数字+拉丁字母合并；B1F、M1F 等不在此列（与 Java isSuiteConceptFloor 一致） */
export function isSuiteConceptFloor(tabKey: string): boolean {
  const k = (tabKey || "").trim().toUpperCase();
  return /^\d+F$/.test(k);
}

/** {@code B1F} 或 {@code B1F-E10} 等与后端 {@link isBasementFloorScopeTabKey} 一致 */
export function isBasementFloorScopeTabKey(tabKey: string): boolean {
  const k = (tabKey || "").trim();
  if (/^B\d*F$/i.test(k)) return true;
  return /^B\d*F-[A-Za-z0-9]+$/i.test(k);
}

export function standardSuiteRoomSegment(roomCanonical: string): string {
  const r = (roomCanonical || "").trim();
  if (!r) return r;
  const parts = r
    .split("-")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return r;
  let i = 0;
  if (LEADING_FLOOR_TOKEN.test(parts[0]!)) i = 1;
  if (i >= parts.length) return r;
  return parts[i]!;
}

/**
 * B1F：跳过可选楼层 token、再跳过连续区段（E10/E11A…），取下一房间码段（与 Java basementSuiteRoomSegment 一致）。
 */
export function basementSuiteRoomSegment(roomCanonical: string): string {
  const r = (roomCanonical || "").trim();
  if (!r) return r;
  const parts = r
    .split("-")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return r;
  let i = 0;
  if (LEADING_FLOOR_TOKEN.test(parts[0]!)) i = 1;
  while (i < parts.length && basementHardZoneFromSingleSegmentRg(parts[i]!) != null) {
    i++;
  }
  if (i >= parts.length) return r;
  return parts[i]!;
}

/** 末尾「数字+拉丁字母」视为套间后缀：101A/101B → 归并键 101（与 Java SUITE_SUFFIX 一致） */
export function normalizeRoomForGrouping(room: string): string {
  const s = (room || "").trim();
  if (!s) return s;
  return s.replace(/(\d+)([A-Za-z]+)$/, "$1");
}

/**
 * 基间（前室）：房间码无 A/B 后缀；单测点时并入套间标题槽。
 * 标准层用 {@link standardSuiteRoomSegment}；B1F 分页用 {@link basementSuiteRoomSegment}；其余用末尾片段。
 */
export function isBaseRoomCanonical(roomCanonical: string, tabKey?: string | null): boolean {
  const r = roomCanonical.trim();
  if (!r.length) return false;
  const tk = tabKey || "";
  let seg: string;
  if (isSuiteConceptFloor(tk)) {
    seg = standardSuiteRoomSegment(roomCanonical);
  } else if (isBasementFloorScopeTabKey(tk)) {
    seg = basementSuiteRoomSegment(roomCanonical);
  } else {
    seg = localPartRoomCanonical(roomCanonical);
  }
  return seg.length > 0 && seg === normalizeRoomForGrouping(seg);
}
