/** 与小程序 utils/twinScanAnalyze.js 同源：scan/analyze 解包、「我的」房间合并、权限角标 */

import type { OverviewRoomRaw } from "./roomDashboard";

export interface ScanAnalyzeDto {
  success?: boolean;
  message?: string;
  currentState?: string;
  pendingRooms?: ScanTargetRoom[];
  allowedRooms?: ScanTargetRoom[];
  globalUserState?: number;
}

export interface ScanTargetRoom {
  displayName?: string;
  officialRoomName?: string;
  name?: string;
  officialRoomId?: string | number;
  id?: string | number;
  isDisabled?: boolean;
  campusTag?: string;
  campus?: string;
}

export interface ParsedAnalyze {
  ok: boolean;
  dto: ScanAnalyzeDto | null;
  httpOk: boolean;
  envelopeOk: boolean;
  message?: string;
}

export type PermissionBadgeKey = "none" | "ok" | "banned";

export interface PermissionBadge {
  key: PermissionBadgeKey;
  text: string;
}

function normalizeRoomKey(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .trim()
    .replace(/[\s　]+/g, "")
    .replace(/[—–]/g, "-")
    .toLowerCase();
}

function splitBindRoomIds(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  return String(raw)
    .replace(/，/g, ",")
    .split(/[,;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function scanRoomBindIds(scanRoom: ScanTargetRoom): Set<string> {
  const ids = new Set<string>();
  const oid = scanRoom.officialRoomId != null ? String(scanRoom.officialRoomId).trim() : "";
  const id = scanRoom.id != null ? String(scanRoom.id).trim() : "";
  if (oid) ids.add(oid);
  if (id) ids.add(id);
  return ids;
}

function overviewBindIds(overviewRoom: OverviewRoomRaw): Set<string> {
  const ids = new Set<string>();
  if (overviewRoom.roomId != null && String(overviewRoom.roomId).trim()) {
    ids.add(String(overviewRoom.roomId).trim());
  }
  for (const id of splitBindRoomIds(overviewRoom.capacityBindRoomId)) {
    ids.add(id);
  }
  return ids;
}

function hyphenTail(key: string): string {
  const idx = key.lastIndexOf("-");
  return idx >= 0 ? key.slice(idx + 1) : key;
}

/** 房号后缀（A/B/C 之类 1~2 位）：本地房 3F-301 对应官方 301/301A/301B，见 room_config.capacity_bind_room_id。 */
const ROOM_CODE_SUFFIX = /^[a-z0-9]{1,2}$/;

/**
 * 与小程序一致：先 officialRoomId 绑定，再校区一致 + 名称/尾段匹配。
 * 尾段允许「本地房号 + 1~2 位后缀」（301 ↔ 301A/301B），但不做裸 includes —— 那会误伤到别的房。
 */
function overviewMatchesScanRoom(overviewRoom: OverviewRoomRaw, scanRoom: ScanTargetRoom): boolean {
  const scanIds = scanRoomBindIds(scanRoom);
  const ovIds = overviewBindIds(overviewRoom);
  for (const id of scanIds) {
    if (ovIds.has(id)) return true;
  }

  const rn = normalizeRoomKey(overviewRoom.roomName);
  if (!rn) return false;
  // 浦东/浦西房号会重名（都有 301A），校区对不上就不是同一间
  const ovCampus = normalizeRoomKey(overviewRoom.campus);
  const scanCampus = normalizeRoomKey(scanRoom.campusTag || scanRoom.campus);
  if (ovCampus && scanCampus && ovCampus !== scanCampus) return false;

  const rnTail = hyphenTail(rn);
  const candidates = [scanRoom.officialRoomName, scanRoom.name, scanRoom.displayName, scanRoom.id];
  for (const raw of candidates) {
    const code = normalizeRoomKey(raw == null ? "" : String(raw));
    if (!code) continue;
    if (code === rn) return true;
    const codeTail = hyphenTail(code);
    if (codeTail === rn) return true;
    if (codeTail === rnTail) return true;
    const cand = hyphenTail(code);
    if (cand.length > rnTail.length && cand.startsWith(rnTail) && ROOM_CODE_SUFFIX.test(cand.slice(rnTail.length))) {
      return true;
    }
  }
  return false;
}

export function pickScanTargetRooms(dto: ScanAnalyzeDto | null | undefined): ScanTargetRoom[] {
  if (!dto || dto.success !== true) return [];
  const allowed = (Array.isArray(dto.allowedRooms) ? dto.allowedRooms : [])
    .filter((r) => r && r.isDisabled !== true);
  if (dto.currentState === "INSIDE") {
    const pending = Array.isArray(dto.pendingRooms) ? dto.pendingRooms : [];
    // INSIDE 时合并 allowedRooms + pendingRooms，"我的"分区展示全部可进入房间
    return [...allowed, ...pending];
  }
  return allowed;
}

/**
 * 「我的房间」以**门禁授权**为准（与小程序 buildMyRooms 同源）：授权房全部出卡，
 * 命中 overview 的补容量/占用，命中不上的（浦西房、本地无房档的房间）也照常出卡，只是没有占用数据。
 * roomId 直接用 officialRoomId —— 延迟选项就是按官方房 id 下发的，卡片带着它，不用再靠名字反查。
 */
export function buildMyRooms(overviewRows: OverviewRoomRaw[], dto: ScanAnalyzeDto | null): OverviewRoomRaw[] {
  const targets = pickScanTargetRooms(dto);
  if (!targets.length) return [];
  const rows = Array.isArray(overviewRows) ? overviewRows : [];
  const seen = new Set<string>();
  const out: OverviewRoomRaw[] = [];
  for (const sr of targets) {
    const oid = sr.officialRoomId != null ? String(sr.officialRoomId).trim() : String(sr.id ?? "").trim();
    const key = oid || String(sr.displayName || sr.officialRoomName || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const ov = rows.find((r) => overviewMatchesScanRoom(r, sr));
    if (ov) {
      out.push({ ...ov, roomId: oid || ov.roomId });
      continue;
    }
    out.push({
      roomId: oid || key,
      roomName: String(sr.officialRoomName || sr.displayName || key).trim(),
      campus: String(sr.campusTag || "").trim(),
      totalCapacity: 0,
      occupants: [],
    });
  }
  return out;
}

/** 与小程序 twinScanAnalyze.computePermissionBadge 一致（仅 globalUserState===3 为禁用） */
export function computePermissionBadge(hasUser: boolean, dto: ScanAnalyzeDto | null): PermissionBadge {
  if (!hasUser) return { key: "none", text: "无权限" };
  if (!dto) return { key: "none", text: "无权限" };
  if (dto.success !== true) return { key: "none", text: "无权限" };
  if (Number(dto.globalUserState) === 3) return { key: "banned", text: "禁用" };
  return { key: "ok", text: "正常" };
}
