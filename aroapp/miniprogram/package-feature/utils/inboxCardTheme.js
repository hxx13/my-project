/**
 * 消息中心卡片：与微信「服务通知」类似的配色与文案（报修 / 采购 / 物资 / 通用）。
 */

function themeKeyForKind(kind) {
  const k = String(kind || '').trim().toUpperCase();
  if (k === 'REPAIR') return 'repair';
  if (k === 'PURCHASE') return 'purchase';
  if (k === 'SUPPLIES_CLAIM') return 'supplies';
  return 'notice';
}

function themeKeyForBizType(bizType) {
  const k = String(bizType || '').trim().toUpperCase();
  if (k === 'REPAIR') return 'repair';
  if (k === 'PURCHASE') return 'purchase';
  if (k === 'SUPPLIES_CLAIM') return 'supplies';
  return 'notice';
}

function bizTypeZh(bizType) {
  const k = String(bizType || '').trim().toUpperCase();
  if (k === 'REPAIR') return '报修';
  if (k === 'PURCHASE') return '采购';
  if (k === 'SUPPLIES_CLAIM') return '物资领用';
  return '';
}

function eventTypeZh(eventType) {
  const k = String(eventType || '').trim().toUpperCase();
  if (k === 'CREATED') return '已创建';
  if (k === 'STARTED') return '已接单';
  if (k === 'COMPLETED') return '已完成';
  if (k === 'WITHDRAWN') return '已撤回';
  if (k === 'DELETED') return '已删除';
  if (k === 'RESTORED') return '已恢复';
  return String(eventType || '').trim();
}

function serviceBrandForKind(kind, payload) {
  const k = String(kind || '').trim().toUpperCase();
  if (k === 'REPAIR') return '实验动物科学部 · 报修';
  if (k === 'PURCHASE') return '实验动物科学部 · 采购';
  if (k === 'SUPPLIES_CLAIM') return '实验动物科学部 · 物资领用';
  if (k === 'NOTIFICATION') {
    const p = payload || {};
    const bz = (p.bizTypeZh && String(p.bizTypeZh).trim()) || bizTypeZh(p.bizType);
    if (bz) return `实验动物科学部 · ${bz}`;
    return '实验动物科学部 · 服务通知';
  }
  return '实验动物科学部 · 通知';
}

function serviceBrandForNoticeRow(bizType) {
  const bz = bizTypeZh(bizType);
  if (bz) return `实验动物科学部 · ${bz}`;
  return '实验动物科学部 · 服务通知';
}

function formatFeedTime(sortAtMillis) {
  const n = Number(sortAtMillis);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  const pad = (x) => (x < 10 ? `0${x}` : `${x}`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  themeKeyForKind,
  themeKeyForBizType,
  bizTypeZh,
  eventTypeZh,
  serviceBrandForKind,
  serviceBrandForNoticeRow,
  formatFeedTime,
};
