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

/** 与小程序一致：先 officialRoomId 绑定，再名称精确/尾段匹配（禁止 includes 误伤） */
function overviewMatchesScanRoom(overviewRoom: OverviewRoomRaw, scanRoom: ScanTargetRoom): boolean {
  const scanIds = scanRoomBindIds(scanRoom);
  const ovIds = overviewBindIds(overviewRoom);
  for (const id of scanIds) {
    if (ovIds.has(id)) return true;
  }

  const rn = normalizeRoomKey(overviewRoom.roomName);
  if (!rn) return false;
  const dn = normalizeRoomKey(scanRoom.displayName);
  const on = normalizeRoomKey(scanRoom.officialRoomName || scanRoom.name);

  if (dn && dn === rn) return true;
  if (on && on === rn) return true;

  const rnTail = hyphenTail(rn);
  if (dn && hyphenTail(dn) === rnTail) return true;
  if (on && hyphenTail(on) === rnTail) return true;

  const campus = normalizeRoomKey(overviewRoom.campus);
  if (campus && dn.startsWith(campus)) {
    const stripped = dn.slice(campus.length).replace(/^-+/, "");
    if (stripped === rn || hyphenTail(stripped) === rnTail) return true;
  }
  return false;
}

export function pickScanTargetRooms(dto: ScanAnalyzeDto | null | undefined): ScanTargetRoom[] {
  if (!dto || dto.success !== true) return [];
  const inside = dto.currentState === "INSIDE";
  if (inside) {
    return Array.isArray(dto.pendingRooms) ? dto.pendingRooms : [];
  }
  const raw = Array.isArray(dto.allowedRooms) ? dto.allowedRooms : [];
  return raw.filter((r) => r && r.isDisabled !== true);
}

export function mergeMyRooms(overviewRows: OverviewRoomRaw[], dto: ScanAnalyzeDto | null): OverviewRoomRaw[] {
  const targets = pickScanTargetRooms(dto);
  if (!targets.length || !Array.isArray(overviewRows)) return [];
  const seen = new Set<string>();
  const out: OverviewRoomRaw[] = [];
  for (const ov of overviewRows) {
    if (targets.some((sr) => overviewMatchesScanRoom(ov, sr))) {
      const key = String(ov.roomId != null ? ov.roomId : ov.roomName);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(ov);
      }
    }
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
