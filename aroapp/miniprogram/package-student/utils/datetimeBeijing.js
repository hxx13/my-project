/**
 * 小程序端时间：与 Spring `LocalDateTime`（无时区墙钟）及带 Z 的 ISO 序列化对齐，统一按北京时间展示与提交。
 */

function z(n) {
  return String(n).padStart(2, '0');
}

/** Jackson 可能将 LocalDateTime 写成数组 [年,月,日,时,分,秒,纳秒] */
function formatFromJacksonArray(arr) {
  if (!Array.isArray(arr) || arr.length < 5) return '';
  const Y = Number(arr[0]);
  const M = Number(arr[1]);
  const D = Number(arr[2]);
  const h = Number(arr[3] ?? 0);
  const m = Number(arr[4] ?? 0);
  const s = Number(arr[5] ?? 0);
  if (!Number.isFinite(Y)) return '';
  return `${Y}-${z(M)}-${z(D)} ${z(h)}:${z(m)}:${z(s)}`;
}

/**
 * 列表/详情展示：统一为北京时间可读串。
 * - 带 Z 或显式偏移：按绝对时刻换算为 UTC+8 墙钟展示
 * - 无时区后缀的 `yyyy-MM-ddTHH:mm:ss`：按设备本地解析（国内微信即东八区）后展示
 * - Jackson 数组：直接按墙钟拼接
 */
function formatBackendDateTimeForDisplay(v) {
  if (v == null || v === '') return '-';
  if (Array.isArray(v)) {
    const s = formatFromJacksonArray(v);
    return s || '-';
  }
  const s = String(v).trim();
  if (!s) return '-';
  // iOS 不支持 "yyyy-MM-dd HH:mm:ss" 空格格式，统一替换为 T
  const d = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) {
    return s.replace('T', ' ').slice(0, 19);
  }
  const hasOffset = /Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  if (hasOffset) {
    const t = d.getTime() + 8 * 3600000;
    const x = new Date(t);
    return `${x.getUTCFullYear()}-${z(x.getUTCMonth() + 1)}-${z(x.getUTCDate())} ${z(x.getUTCHours())}:${z(x.getUTCMinutes())}:${z(x.getUTCSeconds())}`;
  }
  return s.replace('T', ' ').slice(0, 19);
}

/** 设备本地墙钟 → `yyyy-MM-ddTHH:mm:ss`，供 Spring `LocalDateTime` 解析（不要用 toISOString） */
function toLocalDateTimeNoTz(d) {
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

/** `yyyy-MM-dd HH:mm:ss`，用于表单展示 */
function nowLocalWallTextPretty() {
  return timestampToWallText(Date.now());
}

/** 时间选择器毫秒值 → `yyyy-MM-dd HH:mm:ss` */
function timestampToWallText(ts) {
  const d = new Date(Number(ts) || 0);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

/** 展示串 / 手输 → 提交用 `yyyy-MM-ddTHH:mm:ss`（无时区） */
function wallInputToApiLocalDateTime(raw) {
  const t = (raw || '').trim();
  if (!t) return null;
  let norm = t.includes('T') ? t : t.replace(' ', 'T');
  if (norm.length === 16) norm += ':00';
  const d = new Date(norm);
  if (Number.isNaN(d.getTime())) return null;
  return toLocalDateTimeNoTz(d);
}

/** 展示串 → van-datetime-picker 的 value（毫秒） */
function wallTextToTimestampForPicker(s) {
  const t = (s || '').trim();
  if (!t) return Date.now();
  const norm = t.includes('T') ? t : t.replace(' ', 'T');
  const pad = norm.length === 16 ? `${norm}:00` : norm;
  const d = new Date(pad);
  return Number.isNaN(d.getTime()) ? Date.now() : d.getTime();
}

module.exports = {
  formatBackendDateTimeForDisplay,
  toLocalDateTimeNoTz,
  nowLocalWallTextPretty,
  timestampToWallText,
  wallInputToApiLocalDateTime,
  wallTextToTimestampForPicker,
};
