/** 豁免延长至当日时点（HH:mm），默认 18:00 */
var DEFAULT_EXEMPT_UNTIL_TIME = '18:00';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 生成 30 分钟一档的「延长至」预设（含起止边界） */
function buildExemptUntilTimePresets(startHour, startMinute, endHour, endMinute, stepMinutes) {
  var sh = startHour != null ? startHour : 15;
  var sm = startMinute != null ? startMinute : 0;
  var eh = endHour != null ? endHour : 23;
  var em = endMinute != null ? endMinute : 30;
  var step = stepMinutes != null ? stepMinutes : 30;
  var out = [];
  var cursor = sh * 60 + sm;
  var end = eh * 60 + em;
  while (cursor <= end) {
    var h = Math.floor(cursor / 60);
    var m = cursor % 60;
    var untilTime = pad2(h) + ':' + pad2(m);
    out.push({ label: formatExemptUntilLabel(untilTime), untilTime: untilTime });
    cursor += step;
  }
  return out;
}

var EXEMPT_UNTIL_TIME_PRESETS = buildExemptUntilTimePresets();

function formatExemptUntilLabel(untilTime) {
  return '延长至 ' + untilTime;
}

/** @deprecated 使用 EXEMPT_UNTIL_TIME_PRESETS */
var EXEMPT_DURATION_PRESETS = EXEMPT_UNTIL_TIME_PRESETS.map(function (p) {
  return { label: p.label, durationMinutes: 0, untilTime: p.untilTime };
});

function formatExemptExpireAt(expireAt) {
  if (!expireAt || !String(expireAt).trim()) return '';
  var raw = String(expireAt).trim().replace('T', ' ');
  var t = Date.parse(raw.replace(/-/g, '/'));
  if (Number.isNaN(t)) return raw.slice(0, 16);
  var d = new Date(t);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function formatExemptRemaining(expireAt) {
  if (!expireAt) return '';
  var t = Date.parse(String(expireAt).trim().replace(/-/g, '/').replace('T', ' '));
  if (Number.isNaN(t)) return '';
  var diffMs = t - Date.now();
  if (diffMs <= 0) return '已到期';
  var mins = Math.ceil(diffMs / 60000);
  if (mins < 60) return '剩余 ' + mins + ' 分钟';
  var hours = Math.floor(mins / 60);
  var rm = mins % 60;
  if (hours < 24) return rm > 0 ? '剩余 ' + hours + ' 小时 ' + rm + ' 分' : '剩余 ' + hours + ' 小时';
  var days = Math.floor(hours / 24);
  return '剩余 ' + days + ' 天';
}

var EXEMPT_MODE_OPTIONS = [
  { label: '时长限制', value: 'TIME' },
  { label: '次数限制', value: 'COUNT' },
  { label: '时长+次数', value: 'BOTH' },
];

function formatExemptStatus(row) {
  if (!row.freezeExemptFlag || row.freezeExemptFlag !== 1) return '';
  var mode = row.freezeExemptMode || 'TIME';
  var parts = [];
  if (mode === 'TIME' || mode === 'BOTH') {
    var remain = formatExemptRemaining(row.freezeExemptExpireAt);
    if (remain) parts.push(remain);
    var until = formatExemptExpireAt(row.freezeExemptExpireAt);
    if (until) parts.push(until);
  }
  if (mode === 'COUNT' || mode === 'BOTH') {
    var used = row.freezeExemptUsedCount != null ? row.freezeExemptUsedCount : 0;
    var max = row.freezeExemptMaxCount != null ? row.freezeExemptMaxCount : 0;
    parts.push('剩余 ' + (max - used) + '/' + max + ' 次');
  }
  return parts.join(' · ');
}

/** 展示延迟/豁免规则文案：优先 extendUntilTime，兼容旧 durationMinutes */
function formatExemptTimeRule(extendUntilTime, durationMinutes) {
  if (extendUntilTime && String(extendUntilTime).trim()) return formatExemptUntilLabel(String(extendUntilTime).trim());
  if (durationMinutes != null && durationMinutes > 0) return '延长 ' + durationMinutes + ' 分钟（旧规则）';
  if (durationMinutes === -1) return '今日有效（至 24:00）';
  return '—';
}

/** 从 freezeExemptRoomIds JSON 解析房间名数组 */
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
  DEFAULT_EXEMPT_UNTIL_TIME: DEFAULT_EXEMPT_UNTIL_TIME,
  buildExemptUntilTimePresets: buildExemptUntilTimePresets,
  EXEMPT_UNTIL_TIME_PRESETS: EXEMPT_UNTIL_TIME_PRESETS,
  formatExemptUntilLabel: formatExemptUntilLabel,
  EXEMPT_DURATION_PRESETS: EXEMPT_DURATION_PRESETS,
  formatExemptExpireAt: formatExemptExpireAt,
  formatExemptRemaining: formatExemptRemaining,
  EXEMPT_MODE_OPTIONS: EXEMPT_MODE_OPTIONS,
  formatExemptStatus: formatExemptStatus,
  formatExemptTimeRule: formatExemptTimeRule,
  parseExemptRoomNames: parseExemptRoomNames,
};
