/**
 * 小程序房间页 — 扫码 analyze 延迟免冻结（与 H5 mobileScanRoomAccess.ts 同源）
 */

function asBool(v) {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1' || v === 'true') return true;
  if (v === 0 || v === '0' || v === 'false') return false;
  return undefined;
}

function splitCapacityBindRoomIds(raw) {
  if (raw == null || raw === '') return [];
  return String(raw)
    .replace(/，/g, ',')
    .split(/[,;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildOverviewIndex(rows) {
  const byRoomId = {};
  const byRoomName = {};
  (rows || []).forEach((row) => {
    if (!row || typeof row !== 'object') return;
    if (row.roomId != null && String(row.roomId).trim()) {
      byRoomId[String(row.roomId).trim()] = row;
    }
    const name = row.roomName != null ? String(row.roomName).trim() : '';
    if (name) byRoomName[name] = row;
  });
  return { byRoomId, byRoomName };
}

function normalizeScanRoomInfo(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const officialRoomId =
    typeof r.officialRoomId === 'string'
      ? r.officialRoomId
      : r.id != null
        ? String(r.id)
        : '';
  const displayName =
    typeof r.displayName === 'string'
      ? r.displayName
      : typeof r.name === 'string'
        ? r.name
        : typeof r.officialRoomName === 'string'
          ? r.officialRoomName
          : '';
  return {
    id: officialRoomId || displayName,
    name: displayName,
    officialRoomId: officialRoomId || undefined,
    displayName: displayName || undefined,
    officialRoomName: typeof r.officialRoomName === 'string' ? r.officialRoomName : undefined,
    isDisabled: asBool(r.isDisabled),
    enterBlocked: asBool(r.enterBlocked) === true,
    enterBlockReason: typeof r.enterBlockReason === 'string' ? r.enterBlockReason : undefined,
    scanEntryTimeExempt:
      asBool(r.scanEntryTimeExempt) === true || asBool(r.scan_entry_time_exempt) === true,
  };
}

function normalizeMobileScanAnalyze(raw) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const stateRaw = String(safe.currentState || 'UNKNOWN').toUpperCase();
  const currentState = stateRaw === 'INSIDE' || stateRaw === 'OUTSIDE' ? stateRaw : 'UNKNOWN';
  const allowedRaw = Array.isArray(safe.allowedRooms)
    ? safe.allowedRooms
    : Array.isArray(safe.allowed_rooms)
      ? safe.allowed_rooms
      : [];
  const pendingRaw = Array.isArray(safe.pendingRooms)
    ? safe.pendingRooms
    : Array.isArray(safe.pending_rooms)
      ? safe.pending_rooms
      : [];
  const violationNotice = safe.studentViolationNotice || safe.student_violation_notice;
  const unboundNotice = safe.unboundCardNotice || safe.unbound_card_notice;
  const exemptRaw = safe.scanPopupExemptRoomIds || safe.scan_popup_exempt_room_ids;
  const scanPopupExemptRoomIds = Array.isArray(exemptRaw)
    ? exemptRaw.map((v) => String(v).trim()).filter((v) => v.length > 0)
    : [];

  return {
    success: safe.success === true,
    currentState,
    globalUserState: Number(safe.globalUserState != null ? safe.globalUserState : 2),
    allowedRooms: allowedRaw.map(normalizeScanRoomInfo).filter((r) => !r.isDisabled),
    pendingRooms: pendingRaw.map(normalizeScanRoomInfo).filter((r) => !r.isDisabled),
    scanPopupEntryWindowEnabled: asBool(safe.scanPopupEntryWindowEnabled) === true,
    scanPopupEntryAllowedNow:
      safe.scanPopupEntryAllowedNow === undefined && safe.scan_popup_entry_allowed_now === undefined
        ? true
        : asBool(safe.scanPopupEntryAllowedNow) === true || asBool(safe.scan_popup_entry_allowed_now) === true,
    scanPopupExemptRoomIds,
    violationEnterLocked: !!(violationNotice && typeof violationNotice === 'object' && violationNotice.enterLocked),
    unboundEnterLocked: !!(unboundNotice && typeof unboundNotice === 'object' && unboundNotice.enterLocked),
    mobileEnterEnabled:
      asBool(safe.mobileEnterEnabled) === true || asBool(safe.mobile_enter_enabled) === true,
    scanDelayEnabled: asBool(safe.scanDelayEnabled) === true,
    scanDelayButtonLabel:
      typeof safe.scanDelayButtonLabel === 'string' && safe.scanDelayButtonLabel.trim()
        ? safe.scanDelayButtonLabel.trim()
        : '延迟',
    scanDelayOptionsByRoom:
      safe.scanDelayOptionsByRoom && typeof safe.scanDelayOptionsByRoom === 'object'
        ? safe.scanDelayOptionsByRoom
        : {},
  };
}

function resolveScanOfficialRoomId(overviewRoomId, overviewIndex, analyze) {
  if (!analyze || !analyze.success) return null;
  const rid = String(overviewRoomId);
  const searchRooms =
    analyze.currentState === 'INSIDE' && Array.isArray(analyze.pendingRooms) && analyze.pendingRooms.length > 0
      ? (analyze.allowedRooms || []).concat(analyze.pendingRooms || [])
      : analyze.allowedRooms || [];

  for (let i = 0; i < searchRooms.length; i += 1) {
    const r = searchRooms[i];
    const oid = String(r.officialRoomId || r.id || '').trim();
    if (oid === rid) return oid;
  }

  const byRoomId = overviewIndex.byRoomId || {};

  for (let i = 0; i < searchRooms.length; i += 1) {
    const r = searchRooms[i];
    const oid = String(r.officialRoomId || r.id || '').trim();
    if (!oid) continue;

    const ovBind = byRoomId[rid];
    if (ovBind) {
      const binds = splitCapacityBindRoomIds(ovBind.capacityBindRoomId);
      if (binds.indexOf(oid) >= 0) return oid;
    }

    const ov = byRoomId[rid];
    if (ov) {
      const rn = String(ov.roomName || '')
        .trim()
        .replace(/[\s　]+/g, '')
        .replace(/[—–]/g, '-')
        .toLowerCase();
      const dn = String(r.displayName || r.name || r.officialRoomName || '')
        .trim()
        .replace(/[\s　]+/g, '')
        .replace(/[—–]/g, '-')
        .toLowerCase();
      if (rn && dn && (dn === rn || dn.indexOf(rn) >= 0 || rn.indexOf(dn) >= 0)) return oid;
    }
  }

  return null;
}

function getRoomDelayOptions(analyze, scanOfficialRoomId) {
  if (!analyze || !analyze.scanDelayEnabled) return [];
  const map = analyze.scanDelayOptionsByRoom;
  if (!map || typeof map !== 'object') return [];
  const key = scanOfficialRoomId;
  if (Array.isArray(map[key]) && map[key].length) return map[key];
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i += 1) {
    const items = map[keys[i]];
    if (!Array.isArray(items)) continue;
    if (items.some((it) => String(it.roomId != null ? it.roomId : '') === key)) return items;
  }
  return [];
}

/**
 * 该房间当前是否允许扫码进入；与 H5 evaluateMobileRoomAccess 的 enterable 同判据。
 * 【移动端不提供任何解禁入口】违规/未绑卡锁定一律直接拦，不做拼图/答题/签名解锁。
 */
function isRoomEnterable(scanRoom, analyze, overviewRow) {
  if (!scanRoom || !analyze || analyze.success !== true) return false;
  if (analyze.currentState === 'UNKNOWN') return false;
  if (analyze.globalUserState === 3) return false;
  if (scanRoom.isDisabled === true) return false;
  if (scanRoom.enterBlocked === true) return false;
  if (analyze.violationEnterLocked || analyze.unboundEnterLocked) return false;
  if (isRoomEntryTimeBlocked(scanRoom, analyze)) return false;
  if (isRoomFull(scanRoom, overviewRow)) return false;
  return true;
}

/** 不可进入的短原因；判据与 isRoomEnterable 同一套（顺序对齐 H5 getEnterLockReason）。 */
function getRoomEnterBlockReason(scanRoom, analyze, overviewRow) {
  if (!analyze || analyze.success !== true) return '无权限';
  if (!scanRoom) return '无权限';
  if (analyze.currentState === 'UNKNOWN') return '状态同步异常';
  if (analyze.globalUserState === 3) return '已封禁';
  if (isRoomFull(scanRoom, overviewRow)) return '满员';
  if (isRoomEntryTimeBlocked(scanRoom, analyze)) return '非开放时段';
  if (analyze.unboundEnterLocked) return '未绑卡';
  if (analyze.violationEnterLocked) return '违规处理';
  if (scanRoom.enterBlocked === true) {
    return String(scanRoom.enterBlockReason || '').trim() || '不在此校区';
  }
  if (scanRoom.isDisabled === true) return '禁入';
  return '当前不可进入';
}

/** 该房间是否在免冻结时段豁免名单内（与 H5 isRoomScanEntryTimeExempt 同判据） */
function isRoomScanEntryTimeExempt(scanRoom, exemptIds) {
  if (scanRoom && scanRoom.scanEntryTimeExempt) return true;
  const roomId = scanRoom ? String(scanRoom.officialRoomId || scanRoom.id || '').trim() : '';
  return Boolean(roomId && Array.isArray(exemptIds) && exemptIds.indexOf(roomId) >= 0);
}

/** 该房间当前是否被「扫码入口时段」拦截（未启用限制或当前开放中 → 不拦） */
function isRoomEntryTimeBlocked(scanRoom, analyze) {
  if (!analyze || !analyze.scanPopupEntryWindowEnabled || analyze.scanPopupEntryAllowedNow) return false;
  return !isRoomScanEntryTimeExempt(scanRoom, analyze.scanPopupExemptRoomIds);
}

/** 该房间是否满员（与 H5 isRoomFull 同判据：同源笼位合并计数 ≥ 上限） */
function isRoomFull(scanRoom, overviewRow) {
  if (!scanRoom || !overviewRow) return false;
  const scanBindId = String(scanRoom.officialRoomId || scanRoom.id || '').trim();
  if (!scanBindId) return false;
  if (splitCapacityBindRoomIds(overviewRow.capacityBindRoomId).indexOf(scanBindId) < 0) return false;
  const count =
    Number(overviewRow.campusUserCount || 0) +
    Number(overviewRow.borrowedCardCount || 0) +
    Number(overviewRow.followingCount || 0);
  const total = Number(overviewRow.totalCapacity || 0);
  return total > 0 && count >= total;
}

/** 在 analyze 的授权房列表里按 officialRoomId 取回房间对象（进入判据需要 enterBlocked / 时段豁免等字段）。 */
function findScanRoomByOfficialId(analyze, scanId) {
  if (!analyze || analyze.success !== true || !scanId) return null;
  const key = String(scanId).trim();
  if (!key) return null;
  const lists = (analyze.allowedRooms || []).concat(analyze.pendingRooms || []);
  for (let i = 0; i < lists.length; i += 1) {
    if (String(lists[i].officialRoomId || lists[i].id || '').trim() === key) return lists[i];
  }
  return null;
}

module.exports = {
  splitCapacityBindRoomIds,
  buildOverviewIndex,
  normalizeMobileScanAnalyze,
  resolveScanOfficialRoomId,
  getRoomDelayOptions,
  findScanRoomByOfficialId,
  isRoomEnterable,
  getRoomEnterBlockReason,
};
