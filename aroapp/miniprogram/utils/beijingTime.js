/** 与 Web frontend/src/utils/beijingTime.ts 对齐：展示北京时间墙钟 */

// 后端 JVM Asia/Shanghai + Jackson WallClockLocalDateTimeSerializer 已输出北京时间墙钟，无需额外偏移
const Z_EXTRA_MS = 0;
const NAIVE_LOCAL_SQL = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?$/;

function parseToDate(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  if (/Z$/i.test(normalized) || /[+-]\d{2}:\d{2}$/.test(normalized) || /[+-]\d{4}$/.test(normalized)) {
    const t = Date.parse(normalized);
    if (!Number.isFinite(t)) return null;
    if (/Z$/i.test(normalized) && Z_EXTRA_MS !== 0) {
      return new Date(t + Z_EXTRA_MS);
    }
    return new Date(t);
  }
  if (NAIVE_LOCAL_SQL.test(normalized)) {
    const t = Date.parse(`${normalized}+08:00`);
    return Number.isFinite(t) ? new Date(t) : null;
  }
  const t = Date.parse(normalized);
  return Number.isFinite(t) ? new Date(t) : null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatBeijingDateTimeFull(v) {
  const d = parseToDate(v);
  if (!d) return '';
  try {
    const fmt = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const g = (t) => (parts.find((x) => x.type === t) || {}).value || '';
    return `${g('year')}-${pad2(Number(g('month')))}-${pad2(Number(g('day')))} ${pad2(Number(g('hour')))}:${pad2(Number(g('minute')))}:${pad2(Number(g('second')))}`;
  } catch (e) {
    return String(v).replace('T', ' ').slice(0, 19);
  }
}

function parseToTimestamp(v, fallback) {
  const fb = fallback != null ? fallback : 0;
  const d = parseToDate(v);
  if (!d) return fb;
  const t = d.getTime();
  return Number.isFinite(t) ? t : fb;
}

module.exports = {
  parseToDate,
  parseToTimestamp,
  formatBeijingDateTimeFull,
};
