/**
 * 房间 Tab 红点：根据 twin overview 全量房间列表 + 个人关注区域，扫描是否仍有在场人数。
 * 与房间页 sidebar 楼层人数同源逻辑（normalizeRoom + roomPersonCount）。
 */
const { normalizeRoom, roomPersonCount } = require('./roomDashboard.js');

function parseTwinOverview(res) {
  const statusCode = Number(res && res.statusCode);
  let body = res ? res.data : null;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, rows: null };
  }
  if (!body || body.success !== true || !Array.isArray(body.data)) {
    return { ok: false, rows: null };
  }
  return { ok: true, rows: body.data };
}

function roomMatchesWatch(room, selections) {
  const sels = Array.isArray(selections) ? selections : [];
  return sels.some((s) => {
    if (!s || typeof s !== 'object') return false;
    const c = String(s.campus || '').trim();
    const f = String(s.floor || '').trim();
    if (!c || room.campus !== c) return false;
    if (!f) return true;
    return room.floor === f;
  });
}

/** @param {unknown[]} rows twin overview 原始房间行 */
function roomWatchHasPresence(rows, selections) {
  const sels = Array.isArray(selections) ? selections : [];
  if (!sels.length) return false;
  const list = Array.isArray(rows) ? rows.map(normalizeRoom) : [];
  for (let i = 0; i < list.length; i += 1) {
    const room = list[i];
    if (!roomMatchesWatch(room, sels)) continue;
    if (roomPersonCount(room) > 0) return true;
  }
  return false;
}

module.exports = {
  parseTwinOverview,
  roomWatchHasPresence,
};
