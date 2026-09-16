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
  /** 门牌状态色带用：可进 / 待激活 / 被拦 / 无权限 */
  state: "allowed" | "pending" | "blocked" | "none";
}

export interface NormalizedMobileScanAnalyze {
  success: boolean;
  currentState: "INSIDE" | "OUTSIDE" | "UNKNOWN";
  globalUserState: number;
  allowedRooms: RoomInfo[];
  pendingRooms: RoomInfo[];
  scanPopupEntryWindowEnabled: boolean;
  scanPopupEntryAllowedNow: boolean;
  scanPopupExemptRoomIds: string[];
  violationEnterLocked: boolean;
  unboundEnterLocked: boolean;
  scanDelayEnabled: boolean;
  scanDelayButtonLabel: string;
  scanDelayOptionsByRoom: Record<string, Record<string, unknown>[]>;
  /** 移动端房间自助进入：总开关 + 灰度名单判定结果 */
  mobileEnterEnabled: boolean;
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
    pendingRooms: (Array.isArray(safe.pendingRooms)
      ? safe.pendingRooms.map(normalizeScanRoomInfo)
      : Array.isArray(safe.pending_rooms)
        ? (safe.pending_rooms as unknown[]).map(normalizeScanRoomInfo)
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
    scanDelayEnabled: asBool(safe.scanDelayEnabled) ?? false,
    scanDelayButtonLabel:
      typeof safe.scanDelayButtonLabel === "string" && safe.scanDelayButtonLabel.trim()
        ? safe.scanDelayButtonLabel.trim()
        : "延迟",
    scanDelayOptionsByRoom:
      safe.scanDelayOptionsByRoom && typeof safe.scanDelayOptionsByRoom === "object"
        ? (safe.scanDelayOptionsByRoom as Record<string, Record<string, unknown>[]>)
        : {},
    mobileEnterEnabled:
      asBool(safe.mobileEnterEnabled) ??
      asBool(safe.mobile_enter_enabled) ??
      false,
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

/**
 * 将 overview roomId 解析为扫码系统的 officialRoomId。
 * 延迟选项按 officialRoomId 分组，而 H5 房间列表用的是 overview roomId，
 * 需通过 allowedRooms 的匹配关系桥接。
 */
export function resolveScanOfficialRoomId(
  overviewRoomId: string | number,
  overviewIndex: MobileOverviewIndex,
  analyze: NormalizedMobileScanAnalyze | null,
): string | null {
  if (!analyze?.success) return null;
  const rid = String(overviewRoomId);
  const searchRooms =
    analyze.currentState === "INSIDE" && analyze.pendingRooms.length > 0
      ? [...analyze.allowedRooms, ...analyze.pendingRooms]
      : analyze.allowedRooms;
  // 1) 直接命中
  for (const r of searchRooms) {
    const oid = String(r.officialRoomId || r.id || "").trim();
    if (oid === rid) return oid;
  }
  // 2) 通过 overviewIndex 匹配
  for (const r of searchRooms) {
    const oid = String(r.officialRoomId || r.id || "").trim();
    if (!oid) continue;
    // 2a) capacityBindRoomId
    for (const [key, ov] of overviewIndex.byRoomId) {
      for (const bindId of splitCapacityBindRoomIds(ov.capacityBindRoomId)) {
        if (bindId === oid && key === rid) return oid;
      }
    }
    // 2b) name matching (same as findAllowedScanRoom logic)
    for (const [key, ov] of overviewIndex.byRoomId) {
      if (key !== rid) continue;
      const rn = (ov.roomName || "").trim().replace(/[\s　]+/g, "").replace(/[—–]/g, "-").toLowerCase();
      const dn = (r.displayName || r.name || "").trim().replace(/[\s　]+/g, "").replace(/[—–]/g, "-").toLowerCase();
      if (rn && dn && (dn === rn || dn.includes(rn) || rn.includes(dn))) return oid;
    }
  }
  return null;
}

/** 获取某房间的延迟免冻结菜单项（与 useProfilePopup.getDelayOptionsForRoom 同源） */
export function getRoomDelayOptions(
  analyze: NormalizedMobileScanAnalyze | null,
  scanOfficialRoomId: string,
): Record<string, unknown>[] {
  if (!analyze?.scanDelayEnabled) return [];
  const map = analyze.scanDelayOptionsByRoom;
  if (!map) return [];
  const key = scanOfficialRoomId;
  if (map[key]?.length) return map[key];
  // 回退：遍历所有分组查找 roomId 匹配的项
  for (const items of Object.values(map)) {
    if (items.some((it) => String(it.roomId ?? "") === key)) return items;
  }
  return [];
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

/** 房号后缀（A/B/C 之类 1~2 位）：本地房 3F-301 对应官方 301/301A/301B（room_config.capacity_bind_room_id）。 */
const ROOM_CODE_SUFFIX = /^[a-z0-9]{1,2}$/;

function codeTail(key: string): string {
  const idx = key.lastIndexOf("-");
  return idx >= 0 ? key.slice(idx + 1) : key;
}

/**
 * 门禁授权房 vs 房间卡是否同一间（与 twinScanAnalyze.matchesScanRoom 同一套规则）：
 * 先按 id 绑定，再校区一致 + 房号/尾段相等或「尾段 + 1~2 位后缀」。
 * 不做裸 includes —— 那会把 301A 的权限算到 3010 这类别的房上。
 */
function scanRoomMatchesMobileItem(
  scanRoom: RoomInfo,
  item: MobileRoomItem,
  overview?: MobileRoomOverviewRow,
): boolean {
  const bindIds = mobileItemBindIds(item, overview);
  const oid = String(scanRoom.officialRoomId || scanRoom.id || "").trim();
  if (oid && bindIds.has(oid)) return true;

  const roomName = normalizeRoomKey(item.roomName || "");
  if (!roomName) return false;
  const itemCampus = normalizeRoomKey(item.zone || overview?.campus || "");
  const scanCampus = normalizeRoomKey(scanRoom.campusTag || "");
  // 浦东/浦西房号会重名（都有 301A），校区对不上就不是同一间
  if (itemCampus && scanCampus && itemCampus !== scanCampus) return false;

  const roomTail = codeTail(roomName);
  const codes = [scanRoom.displayName, scanRoom.name];
  for (const raw of codes) {
    const code = normalizeRoomKey(raw || "");
    if (!code) continue;
    if (code === roomName) return true;
    const tail = codeTail(code);
    if (tail === roomName || tail === roomTail) return true;
    if (tail.length > roomTail.length && tail.startsWith(roomTail) && ROOM_CODE_SUFFIX.test(tail.slice(roomTail.length))) {
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
      state: "none",
    };
  }

  const overview = resolveOverviewRow(item, overviewIndex);
  const searchRooms =
    analyze.currentState === "INSIDE" && analyze.pendingRooms.length > 0
      ? [...analyze.allowedRooms, ...analyze.pendingRooms]
      : analyze.allowedRooms;
  const scanRoom = findAllowedScanRoom(item, overview, searchRooms);

  if (!scanRoom) {
    return {
      canOpenDetail: false,
      enterable: false,
      dimmed: true,
      reasonShort: "无权限",
      state: "none",
    };
  }

  const scanId = String(scanRoom.officialRoomId || scanRoom.id || "").trim();
  const isPending =
    !!scanId &&
    analyze.pendingRooms.some((r) => String(r.officialRoomId || r.id || "").trim() === scanId);

  const locked = isScanEnterLocked(scanRoom, analyze, overviewRows);
  if (locked) {
    const reason = getEnterLockReason(scanRoom, analyze, overviewRows) || "不可进入";
    // 满员时不阻止点击查看房间详情，仅禁止进入
    const isOnlyFull =
      isRoomFull(scanRoom, overviewRows) &&
      !(analyze.currentState === "UNKNOWN" ||
        scanRoom.enterBlocked ||
        scanRoom.isDisabled ||
        analyze.globalUserState === 3 ||
        isEntryTimeBlockedForRoom(scanRoom, analyze) ||
        analyze.violationEnterLocked ||
        analyze.unboundEnterLocked);
    return {
      canOpenDetail: isOnlyFull,
      enterable: false,
      dimmed: true,
      reasonShort: reason,
      state: "blocked",
    };
  }

  return {
    canOpenDetail: true,
    enterable: true,
    dimmed: false,
    state: isPending ? "pending" : "allowed",
  };
}
