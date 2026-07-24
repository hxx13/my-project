/**
 * 与程序坞扫码同源：GET /api/v1/twin/scan/analyze 的 Result 解包、权限角标、与 wechat-overview 房间匹配。
 */

const springAuth = require('./springAuth.js');

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

function overviewMatchesScanRoom(overviewRoom, scanRoom) {
  const rn = normalizeRoomKey(overviewRoom.roomName);
  if (!rn) return false;
  const dn = normalizeRoomKey(scanRoom.displayName);
  const on = normalizeRoomKey(scanRoom.officialRoomName || scanRoom.name);
  if (dn && (dn === rn || dn.includes(rn) || rn.includes(dn))) return true;
  if (on && (on === rn || on.includes(rn) || rn.includes(on))) return true;
  const campus = String(overviewRoom.campus || '').trim();
  if (campus && dn) {
    const cNorm = normalizeRoomKey(campus);
    const stripped = dn.replace(new RegExp(`^${cNorm}`), '');
    if (stripped && (stripped === rn || stripped.includes(rn) || rn.includes(stripped))) return true;
  }
  return false;
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

function mergeMyRooms(overviewRows, dto) {
  const targets = pickScanTargetRooms(dto);
  if (!targets.length || !Array.isArray(overviewRows)) return [];
  const seen = new Set();
  const out = [];
  overviewRows.forEach((ov) => {
    if (targets.some((sr) => overviewMatchesScanRoom(ov, sr))) {
      const key = String(ov.roomId != null ? ov.roomId : ov.roomName);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(ov);
      }
    }
  });
  return out;
}

module.exports = {
  readSpringUserId,
  parseAnalyzeResult,
  computePermissionBadge,
  mergeMyRooms,
  pickAccessibleRooms,
  pickScanTargetRooms,
  scanTargetRoomsToCandidates,
};
