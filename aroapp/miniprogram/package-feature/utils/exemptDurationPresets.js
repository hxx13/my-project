/** 豁免延长至当日时点 HH:mm；默认 18:00 */
const DEFAULT_EXEMPT_UNTIL_TIME = '18:00';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function buildExemptUntilTimePresets(startHour, startMinute, endHour, endMinute, stepMinutes) {
  const sh = startHour != null ? startHour : 15;
  const sm = startMinute != null ? startMinute : 0;
  const eh = endHour != null ? endHour : 23;
  const em = endMinute != null ? endMinute : 30;
  const step = stepMinutes != null ? stepMinutes : 30;
  const out = [];
  let cursor = sh * 60 + sm;
  const end = eh * 60 + em;
  while (cursor <= end) {
    const h = Math.floor(cursor / 60);
    const m = cursor % 60;
    const untilTime = pad2(h) + ':' + pad2(m);
    out.push({ label: formatExemptUntilLabel(untilTime), untilTime: untilTime });
    cursor += step;
  }
  return out;
}

const EXEMPT_UNTIL_TIME_PRESETS = buildExemptUntilTimePresets();

function formatExemptUntilLabel(untilTime) {
  return '延长至 ' + untilTime;
}

/** @deprecated 兼容旧引用 */
const EXEMPT_DURATION_PRESETS = EXEMPT_UNTIL_TIME_PRESETS.map(function (p) {
  return { label: p.label, durationMinutes: 0, untilTime: p.untilTime };
});

function formatExemptRemaining(expireAt) {
  if (!expireAt) return '';
  const t = Date.parse(String(expireAt).trim().replace(/-/g, '/').replace('T', ' '));
  if (Number.isNaN(t)) return '';
  const diffMs = t - Date.now();
  if (diffMs <= 0) return '已到期';
  const mins = Math.ceil(diffMs / 60000);
  if (mins < 60) return '剩余' + mins + '分钟';
  const hours = Math.floor(mins / 60);
  const rm = mins % 60;
  if (hours < 24) return rm > 0 ? '剩余' + hours + '小时' + rm + '分' : '剩余' + hours + '小时';
  return '剩余' + Math.floor(hours / 24) + '天';
}

function isExemptActive(row) {
  if (!row || Number(row.freezeExemptFlag) !== 1) return false;
  const exp = row.freezeExemptExpireAt;
  if (!exp) return true;
  const t = Date.parse(String(exp).trim().replace(/-/g, '/').replace('T', ' '));
  return !Number.isNaN(t) && t > Date.now();
}

function pickExemptUntilTime() {
  return new Promise(function (resolve) {
    wx.showActionSheet({
      itemList: EXEMPT_UNTIL_TIME_PRESETS.map(function (p) { return p.label; }),
      success: function (res) {
        var preset = EXEMPT_UNTIL_TIME_PRESETS[res.tapIndex];
        resolve(preset ? preset.untilTime : null);
      },
      fail: function () { resolve(null); },
    });
  });
}

/** @deprecated 使用 pickExemptUntilTime */
function pickExemptDuration() {
  return pickExemptUntilTime().then(function (untilTime) {
    return untilTime;
  });
}

const EXEMPT_MODE_OPTIONS = [
  { label: '时长限制', value: 'TIME' },
  { label: '次数限制', value: 'COUNT' },
  { label: '时长+次数', value: 'BOTH' },
];

function formatExemptExpireAt(expireAt) {
  if (!expireAt) return '';
  var raw = String(expireAt).trim().replace('T', ' ');
  var t = Date.parse(raw.replace(/-/g, '/'));
  if (Number.isNaN(t)) return '';
  var d = new Date(t);
  var now = new Date();
  var prefix = (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate())
    ? '至 '
    : (pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ');
  return prefix + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function formatExemptStatus(row) {
  if (!row || Number(row.freezeExemptFlag) !== 1) return '';
  const mode = row.freezeExemptMode || 'TIME';
  const parts = [];
  if (mode === 'TIME' || mode === 'BOTH') {
    const remain = formatExemptRemaining(row.freezeExemptExpireAt);
    if (remain) parts.push(remain);
    const until = formatExemptExpireAt(row.freezeExemptExpireAt);
    if (until) parts.push(until);
  }
  if (mode === 'COUNT' || mode === 'BOTH') {
    const used = Number(row.freezeExemptUsedCount || 0);
    const max = Number(row.freezeExemptMaxCount || 0);
    parts.push('剩余' + (max - used) + '/' + max + '次');
  }
  return parts.join(' · ');
}

function pickExemptMode() {
  return new Promise(function (resolve) {
    wx.showActionSheet({
      itemList: EXEMPT_MODE_OPTIONS.map(function (p) { return p.label; }),
      success: function (res) {
        var opt = EXEMPT_MODE_OPTIONS[res.tapIndex];
        resolve(opt ? opt.value : null);
      },
      fail: function () { resolve(null); },
    });
  });
}

function parseOfficialRooms(prefill) {
  const rooms = (prefill && prefill.officialRooms) || [];
  return rooms
    .map(function (r) {
      return {
        roomId: String(r.id || r.roomId || ''),
        roomName: String(r.name || r.roomName || r.title || ''),
        selected: false,
      };
    })
    .filter(function (r) { return r.roomId; });
}

function serializeSelectedRoomIds(rooms) {
  const ids = (rooms || []).filter(function (r) { return r.selected; }).map(function (r) { return r.roomId; });
  return ids.length ? JSON.stringify(ids) : null;
}

function parseExemptRoomNames(roomIdsJson) {
  if (!roomIdsJson) return [];
  try {
    var arr = JSON.parse(roomIdsJson);
    if (!Array.isArray(arr) || arr.length === 0) return [];
    return arr.map(function (item) {
      if (typeof item === 'object' && item !== null) {
        var name = item.roomName;
        if (typeof name === 'string' && name.trim()) return name.trim();
        var id = item.roomId;
        return typeof id === 'string' ? id : '';
      }
      if (typeof item === 'string') return item;
      return '';
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

module.exports = {
  DEFAULT_EXEMPT_UNTIL_TIME,
  EXEMPT_UNTIL_TIME_PRESETS,
  EXEMPT_DURATION_PRESETS,
  EXEMPT_MODE_OPTIONS,
  formatExemptUntilLabel,
  formatExemptExpireAt,
  formatExemptRemaining,
  formatExemptStatus,
  isExemptActive,
  pickExemptUntilTime,
  pickExemptDuration,
  pickExemptMode,
  parseOfficialRooms,
  parseExemptRoomNames,
  serializeSelectedRoomIds,
};
