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
    isDisabled: asBool(r.isDisabled),
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

  return {
    success: safe.success === true,
    currentState,
    globalUserState: Number(safe.globalUserState != null ? safe.globalUserState : 2),
    allowedRooms: allowedRaw.map(normalizeScanRoomInfo).filter((r) => !r.isDisabled),
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
  const allowed = analyze.allowedRooms || [];

  for (let i = 0; i < allowed.length; i += 1) {
    const r = allowed[i];
    const oid = String(r.officialRoomId || r.id || '').trim();
    if (oid === rid) return oid;
  }

  const byRoomId = overviewIndex.byRoomId || {};

  for (let i = 0; i < allowed.length; i += 1) {
    const r = allowed[i];
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
      const dn = String(r.displayName || r.name || '')
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

module.exports = {
  splitCapacityBindRoomIds,
  buildOverviewIndex,
  normalizeMobileScanAnalyze,
  resolveScanOfficialRoomId,
  getRoomDelayOptions,
};
