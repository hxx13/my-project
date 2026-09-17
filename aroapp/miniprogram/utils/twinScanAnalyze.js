/**
 * 与程序坞扫码同源：GET /api/v1/twin/scan/analyze 的 Result 解包、权限角标、与 wechat-overview 房间匹配。
 */

const springAuth = require('./springAuth.js');
const mobileScanRoomAccess = require('./mobileScanRoomAccess.js');

function readSpringUserId() {
  try {
    const raw = wx.getStorageSync(springAuth.KEYS.USER_INFO);
    if (!raw) return '';
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object') return '';
    const id = obj.id != null ? String(obj.id).trim() : '';
    const alt = obj.userId != null ? String(obj.userId).trim() : '';
    return id || alt;
  } catch (e) {
    return '';
  }
}

function parseJsonBody(res) {
  let body = res ? res.data : null;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return null;
    }
  }
  return body && typeof body === 'object' ? body : null;
}

/**
 * Spring Result<ScanAnalyzeResponseDTO>
 * @returns {{ ok: boolean, dto: object|null, httpOk: boolean, envelopeOk: boolean, message?: string }}
 */
function parseAnalyzeResult(res) {
  const statusCode = Number(res && res.statusCode);
  const httpOk = statusCode === 200;
  const body = parseJsonBody(res);
  if (!httpOk || !body || body.success !== true) {
    return {
      ok: false,
      dto: null,
      httpOk,
      envelopeOk: !!(body && body.success === true),
      message: (body && body.message) || `HTTP ${statusCode || 0}`,
    };
  }
  const dto = body.data;
  if (!dto || typeof dto !== 'object') {
    return { ok: true, dto: null, httpOk, envelopeOk: true, message: '' };
  }
  return { ok: true, dto, httpOk, envelopeOk: true, message: '' };
}

function computePermissionBadge({ userId, parsedAnalyze }) {
  if (!userId) {
    return { key: 'none', text: '无权限' };
  }
  if (!parsedAnalyze.httpOk || !parsedAnalyze.envelopeOk) {
    return { key: 'none', text: '无权限' };
  }
  const dto = parsedAnalyze.dto;
  if (!dto || dto.success !== true) {
    return { key: 'none', text: '无权限' };
  }
  if (Number(dto.globalUserState) === 3) {
    return { key: 'banned', text: '禁用' };
  }
  /*
    角标口径（2026-09-17 定）：不再表示「本人当前状态」，改为**当前时段能否进入** ——
    能进 = 正常，不能进 = 非开放时间段。判据复用 H5 那套（scanAssistantSpeak）：
    scanPopupEntryWindowEnabled && !scanPopupEntryAllowedNow。这里不看房间豁免名单，
    那是逐房间的判定（mobileScanRoomAccess.isRoomEntryTimeBlocked）。
    归一化走 mobileScanRoomAccess：它同时兜了 snake_case 与字段缺失（缺省视为开放）。
  */
  const access = mobileScanRoomAccess.normalizeMobileScanAnalyze(dto);
  if (access.scanPopupEntryWindowEnabled && !access.scanPopupEntryAllowedNow) {
    return { key: 'closed', text: '非开放时间段' };
  }
  return { key: 'ok', text: '正常' };
}

function normalizeRoomKey(s) {
  if (s == null) return '';
  return String(s)
    .trim()
    .replace(/[\s　]+/g, '')
    .replace(/[—–]/g, '-')
    .toLowerCase();
}

/** 末段房号：5F-503 → 503；浦东 4F - 401 → 401 */
function roomCodeTail(raw) {
  const n = normalizeRoomKey(raw);
  if (!n) return '';
  const parts = n.split('-').filter((p) => p);
  return parts.length ? parts[parts.length - 1] : n;
}

/** 房号后缀（A/B/C 之类 1~2 位）：本地房 3F-301 对应官方 301/301A/301B，见 room_config.capacity_bind_room_id。 */
const ROOM_CODE_SUFFIX = /^[a-z0-9]{1,2}$/;

function overviewMatchesScanRoom(overviewRoom, scanRoom) {
  const rn = normalizeRoomKey(overviewRoom.roomName);
  if (!rn) return false;
  // 浦东/浦西房号会重名（都有 301A），校区对不上就不是同一间
  const ovCampus = normalizeRoomKey(overviewRoom.campus);
  const scanCampus = normalizeRoomKey(scanRoom.campusTag || scanRoom.campus);
  if (ovCampus && scanCampus && ovCampus !== scanCampus) return false;
  const tn = roomCodeTail(overviewRoom.roomName);
  const codes = [scanRoom.officialRoomName, scanRoom.name, scanRoom.displayName];
  for (let i = 0; i < codes.length; i += 1) {
    const code = normalizeRoomKey(codes[i]);
    if (!code) continue;
    if (code === rn || code === tn) return true;
    const ct = roomCodeTail(codes[i]);
    if (ct && (ct === tn || ct === rn)) return true;
    const cand = ct || code;
    if (cand.length > tn.length && cand.indexOf(tn) === 0 && ROOM_CODE_SUFFIX.test(cand.slice(tn.length))) {
      return true;
    }
  }
  return false;
}

/**
 * 「我的房间」以**门禁授权**为准：授权房全部出卡，命中 overview 的补容量/占用，
 * 命中不上的（浦西房、本地没有房档的房间）也照常出卡，只是没有占用数据。
 * roomId 直接用 officialRoomId —— 延迟选项就是按官方房 id 下发的，卡片带着它，不用再靠名字反查。
 */
function buildMyRooms(overviewRows, dto) {
  const targets = pickScanTargetRooms(dto);
  if (!targets.length) return [];
  const rows = Array.isArray(overviewRows) ? overviewRows : [];
  const seen = new Set();
  const out = [];
  targets.forEach((sr) => {
    const oid = String(sr.officialRoomId || sr.id || '').trim();
    const key = oid || String(sr.displayName || sr.officialRoomName || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    let ov = null;
    for (let i = 0; i < rows.length; i += 1) {
      if (overviewMatchesScanRoom(rows[i], sr)) {
        ov = rows[i];
        break;
      }
    }
    if (ov) {
      out.push({ ...ov, roomId: oid || ov.roomId, scanOfficialRoomId: oid });
      return;
    }
    out.push({
      roomId: oid || key,
      scanOfficialRoomId: oid,
      roomName: String(sr.officialRoomName || sr.displayName || key).trim(),
      campus: String(sr.campusTag || '').trim(),
      totalCapacity: 0,
      occupants: [],
      permissionOnly: true,
    });
  });
  return out;
}

function pickScanTargetRooms(dto) {
  if (!dto || dto.success !== true) return [];
  const allowed = (Array.isArray(dto.allowedRooms) ? dto.allowedRooms : [])
    .filter((r) => r && r.isDisabled !== true);
  if (dto.currentState === 'INSIDE') {
    const pending = Array.isArray(dto.pendingRooms) ? dto.pendingRooms : [];
    return allowed.concat(pending);
  }
  return allowed;
}

/** 与门禁/预测表一致的 officialRoomId，供 AI 画像等场景优先探测 */
function scanTargetRoomsToCandidates(dto) {
  const targets = pickScanTargetRooms(dto);
  const out = [];
  if (!Array.isArray(targets)) return out;
  const seen = new Set();
  targets.forEach((t) => {
    if (!t || typeof t !== 'object') return;
    const roomId = String(
      t.officialRoomId != null ? t.officialRoomId : t.id != null ? t.id : ''
    ).trim();
    if (!roomId || seen.has(roomId)) return;
    seen.add(roomId);
    const roomName = String(t.displayName || t.officialRoomName || t.name || '');
    const s = String(roomName || '');
    const i = s.indexOf('-');
    const shortName = i >= 0 ? s.slice(i + 1).trim() || s : s;
    out.push({ roomId, roomName, shortName });
  });
  return out;
}

/** 房间页「我的」：始终展示全部可进入房间（不受 INSIDE 态 pendingRooms 限制） */
function pickAccessibleRooms(dto) {
  if (!dto || dto.success !== true) return [];
  const raw = Array.isArray(dto.allowedRooms) ? dto.allowedRooms : [];
  return raw.filter((r) => r && r.isDisabled !== true);
}

module.exports = {
  readSpringUserId,
  parseAnalyzeResult,
  computePermissionBadge,
  buildMyRooms,
  overviewMatchesScanRoom,
  pickAccessibleRooms,
  pickScanTargetRooms,
  scanTargetRoomsToCandidates,
};
