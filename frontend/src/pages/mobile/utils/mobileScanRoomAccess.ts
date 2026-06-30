/**
 * 手机版房间页 — 扫码弹窗同源进入权限（对齐 useProfilePopup / scanner.api）
 */
import type { MobileRoomItem, MobileRoomOverviewRow } from "@/api/domains/mobileStudent.api";
import type { RoomInfo } from "@/api/types/scanner";
import type { MobileOverviewIndex } from "./mobileRoomWebData";

export type MobilePermissionBadgeKey = "none" | "ok" | "banned" | "time";

export interface MobilePermissionBadge {
  key: MobilePermissionBadgeKey;
  text: string;
}

export interface MobileRoomAccessMeta {
  /** 是否可点击查看详情（仅本人可进入的房间） */
  canOpenDetail: boolean;
  /** 是否具备进入权限且未上锁 */
  enterable: boolean;
  dimmed: boolean;
  /** 卡片角标短文案 */
  reasonShort?: string;
}

export interface NormalizedMobileScanAnalyze {
  success: boolean;
  currentState: "INSIDE" | "OUTSIDE" | "UNKNOWN";
  globalUserState: number;
  allowedRooms: RoomInfo[];
  scanPopupEntryWindowEnabled: boolean;
  scanPopupEntryAllowedNow: boolean;
  scanPopupExemptRoomIds: string[];
  violationEnterLocked: boolean;
  unboundEnterLocked: boolean;
}

export interface RoomPreviewAccessBundle {
  access: MobileRoomAccessMeta;
}

function asBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1" || v === "true") return true;
  if (v === 0 || v === "0" || v === "false") return false;
  return undefined;
}

/** 与 useProfilePopup.splitCapacityBindRoomIds 一致 */
export function splitCapacityBindRoomIds(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  return String(raw)
    .replace(/，/g, ",")
    .split(/[,;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 与 scanner.api normalizeRoomInfo 一致 */
function normalizeScanRoomInfo(raw: unknown): RoomInfo {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const officialRoomId =
    typeof r.officialRoomId === "string"
      ? r.officialRoomId
      : typeof r.id === "string"
        ? r.id
        : r.id != null
          ? String(r.id)
          : "";
  const displayName =
    typeof r.displayName === "string"
      ? r.displayName
      : typeof r.name === "string"
        ? r.name
        : typeof r.officialRoomName === "string"
          ? r.officialRoomName
          : "";
  return {
    id: officialRoomId || displayName,
    name: displayName,
    officialRoomId: officialRoomId || undefined,
    displayName: displayName || undefined,
    areaName: typeof r.areaName === "string" ? r.areaName : undefined,
    floorName: typeof r.floorName === "string" ? r.floorName : undefined,
    regionName: typeof r.regionName === "string" ? r.regionName : undefined,
    campusTag:
      typeof r.campusTag === "string"
        ? r.campusTag
        : typeof r.campus_tag === "string"
          ? r.campus_tag
          : undefined,
    isDisabled: asBool(r.isDisabled),
    disableReason: typeof r.disableReason === "string" ? r.disableReason : undefined,
    enterBlocked: asBool(r.enterBlocked),
    enterBlockReason: typeof r.enterBlockReason === "string" ? r.enterBlockReason : undefined,
    scanEntryTimeExempt:
      asBool(r.scanEntryTimeExempt) ?? asBool(r.scan_entry_time_exempt) ?? undefined,
  };
}

export function normalizeMobileScanAnalyze(
  raw: Record<string, unknown> | null | undefined,
): NormalizedMobileScanAnalyze {
  const safe = raw && typeof raw === "object" ? raw : {};
  const stateRaw = String(safe.currentState ?? "UNKNOWN").toUpperCase();
  const currentState =
    stateRaw === "INSIDE" || stateRaw === "OUTSIDE" ? stateRaw : "UNKNOWN";

  const exemptRaw = safe.scanPopupExemptRoomIds ?? safe.scan_popup_exempt_room_ids;
  const scanPopupExemptRoomIds = Array.isArray(exemptRaw)
    ? exemptRaw.map((id) => String(id).trim()).filter(Boolean)
    : [];

  const violationNotice = safe.studentViolationNotice ?? safe.student_violation_notice;
  const unboundNotice = safe.unboundCardNotice ?? safe.unbound_card_notice;

  return {
    success: safe.success === true,
    currentState,
    globalUserState: Number(safe.globalUserState ?? 2),
    allowedRooms: (Array.isArray(safe.allowedRooms)
      ? safe.allowedRooms.map(normalizeScanRoomInfo)
      : Array.isArray(safe.allowed_rooms)
        ? (safe.allowed_rooms as unknown[]).map(normalizeScanRoomInfo)
        : []).filter((r) => !r.isDisabled),
    scanPopupEntryWindowEnabled:
      asBool(safe.scanPopupEntryWindowEnabled) ??
      asBool(safe.scan_popup_entry_window_enabled) ??
      false,
    scanPopupEntryAllowedNow:
      asBool(safe.scanPopupEntryAllowedNow) ??
      asBool(safe.scan_popup_entry_allowed_now) ??
      true,
    scanPopupExemptRoomIds,
    violationEnterLocked: Boolean(
      violationNotice &&
        typeof violationNotice === "object" &&
        (violationNotice as { enterLocked?: boolean }).enterLocked,
    ),
    unboundEnterLocked: Boolean(
      unboundNotice &&
        typeof unboundNotice === "object" &&
        (unboundNotice as { enterLocked?: boolean }).enterLocked,
    ),
  };
}

export function computeMobilePermissionBadge(
  analyze: NormalizedMobileScanAnalyze | null,
): MobilePermissionBadge {
  if (!analyze || !analyze.success) return { key: "none", text: "无权限" };
  // 角标仅反映「扫码弹窗入口时段」是否开放，不看封禁/违规/绑卡（与房间卡片权限评估分离）
  if (analyze.scanPopupEntryWindowEnabled && !analyze.scanPopupEntryAllowedNow) {
    return { key: "time", text: "非开放时段" };
  }
  return { key: "ok", text: "正常" };
}

function normalizeRoomKey(s: string): string {
  return s
    .trim()
    .replace(/[\s　]+/g, "")
    .replace(/[—–]/g, "-")
    .toLowerCase();
}

function resolveOverviewRow(
  item: MobileRoomItem,
  overviewIndex: MobileOverviewIndex,
): MobileRoomOverviewRow | undefined {
  const rid = String(item.roomId ?? "").trim();
  if (rid) {
    const byId = overviewIndex.byRoomId.get(rid);
    if (byId) return byId as MobileRoomOverviewRow;
  }
  const name = item.roomName?.trim();
  if (name) {
    const byName = overviewIndex.byRoomName.get(name);
    if (byName) return byName as MobileRoomOverviewRow;
  }
  return undefined;
}

function mobileItemBindIds(
  item: MobileRoomItem,
  overview?: MobileRoomOverviewRow,
): Set<string> {
  const ids = new Set<string>();
  const rid = String(item.roomId ?? "").trim();
  if (rid) ids.add(rid);
  if (overview) {
    for (const id of splitCapacityBindRoomIds(overview.capacityBindRoomId)) ids.add(id);
    if (overview.roomId != null) ids.add(String(overview.roomId).trim());
  }
  return ids;
}

function scanRoomMatchesMobileItem(
  scanRoom: RoomInfo,
  item: MobileRoomItem,
  overview?: MobileRoomOverviewRow,
): boolean {
  const bindIds = mobileItemBindIds(item, overview);
  const oid = String(scanRoom.officialRoomId || scanRoom.id || "").trim();
  if (oid && bindIds.has(oid)) return true;

  const roomName = normalizeRoomKey(item.roomName || "");
  const dn = normalizeRoomKey(scanRoom.displayName || scanRoom.name || "");
  if (roomName && dn && (dn === roomName || dn.includes(roomName) || roomName.includes(dn))) {
    return true;
  }
  const campus = normalizeRoomKey(item.zone || overview?.campus || "");
  if (campus && dn) {
    const stripped = dn.replace(new RegExp(`^${campus}`), "");
    if (
      stripped &&
      roomName &&
      (stripped === roomName || stripped.includes(roomName) || roomName.includes(stripped))
    ) {
      return true;
    }
  }
  return false;
}

function findAllowedScanRoom(
  item: MobileRoomItem,
  overview: MobileRoomOverviewRow | undefined,
  allowedRooms: RoomInfo[],
): RoomInfo | null {
  for (const r of allowedRooms) {
    if (scanRoomMatchesMobileItem(r, item, overview)) return r;
  }
  return null;
}

function isRoomScanEntryTimeExempt(
  room: RoomInfo,
  exemptIds: string[],
): boolean {
  if (room.scanEntryTimeExempt) return true;
  const roomId = String(room.officialRoomId || room.id || "").trim();
  return Boolean(roomId && exemptIds.includes(roomId));
}

function isEntryTimeBlockedForRoom(
  room: RoomInfo,
  analyze: NormalizedMobileScanAnalyze,
): boolean {
  return Boolean(
    analyze.scanPopupEntryWindowEnabled &&
      !analyze.scanPopupEntryAllowedNow &&
      !isRoomScanEntryTimeExempt(room, analyze.scanPopupExemptRoomIds),
  );
}

function isRoomFull(
  scanRoom: RoomInfo,
  overviewRows: MobileRoomOverviewRow[],
): boolean {
  const scanBindId = String(scanRoom.officialRoomId || scanRoom.id || "").trim();
  if (!scanBindId) return false;
  for (const ov of overviewRows) {
    const bindIds = splitCapacityBindRoomIds(ov.capacityBindRoomId);
    if (!bindIds.includes(scanBindId)) continue;
    const count =
      (ov.campusUserCount || 0) + (ov.borrowedCardCount || 0) + (ov.followingCount || 0);
    const total = ov.totalCapacity || 0;
    return total > 0 && count >= total;
  }
  return false;
}

function getEnterLockReason(
  scanRoom: RoomInfo,
  analyze: NormalizedMobileScanAnalyze,
  overviewRows: MobileRoomOverviewRow[],
): string | null {
  if (analyze.currentState === "UNKNOWN") return "状态同步异常";
  if (analyze.globalUserState === 3) return "已封禁";
  if (isRoomFull(scanRoom, overviewRows)) return "满员";
  if (isEntryTimeBlockedForRoom(scanRoom, analyze)) return "非开放时段";
  if (analyze.unboundEnterLocked) return "未绑卡";
  if (analyze.violationEnterLocked) return "违规处理";
  if (scanRoom.enterBlocked) {
    return scanRoom.enterBlockReason?.trim() || "不在此校区";
  }
  if (scanRoom.isDisabled) {
    return scanRoom.disableReason?.trim() || "禁入";
  }
  return null;
}

function isScanEnterLocked(
  scanRoom: RoomInfo,
  analyze: NormalizedMobileScanAnalyze,
  overviewRows: MobileRoomOverviewRow[],
): boolean {
  return Boolean(
    analyze.currentState === "UNKNOWN" ||
      scanRoom.enterBlocked ||
      scanRoom.isDisabled ||
      analyze.globalUserState === 3 ||
      isRoomFull(scanRoom, overviewRows) ||
      isEntryTimeBlockedForRoom(scanRoom, analyze) ||
      analyze.violationEnterLocked ||
      analyze.unboundEnterLocked,
  );
}

export function evaluateMobileRoomAccess(
  item: MobileRoomItem,
  overviewIndex: MobileOverviewIndex,
  analyze: NormalizedMobileScanAnalyze | null,
  overviewRows: MobileRoomOverviewRow[],
): MobileRoomAccessMeta {
  if (!analyze || !analyze.success) {
    return {
      canOpenDetail: false,
      enterable: false,
      dimmed: true,
      reasonShort: "无权限",
    };
  }

  const overview = resolveOverviewRow(item, overviewIndex);
  const scanRoom = findAllowedScanRoom(item, overview, analyze.allowedRooms);

  if (!scanRoom) {
    return {
      canOpenDetail: false,
      enterable: false,
      dimmed: true,
      reasonShort: "无权限",
    };
  }

  const locked = isScanEnterLocked(scanRoom, analyze, overviewRows);
  if (locked) {
    const reason = getEnterLockReason(scanRoom, analyze, overviewRows) || "不可进入";
    return {
      canOpenDetail: false,
      enterable: false,
      dimmed: true,
      reasonShort: reason,
    };
  }

  return {
    canOpenDetail: true,
    enterable: true,
    dimmed: false,
  };
}
