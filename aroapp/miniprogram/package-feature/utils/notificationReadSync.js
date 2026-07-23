const springAuth = require('../../utils/springAuth.js');
const { refreshPendingBadges: pullPendingBadgeSnapshot } = require('../../utils/badgeSnapshotStore.js');

function parseResponse(res) {
  const { statusCode, data } = res;
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false, message: body || '响应解析失败' };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode})` };
  }
  return { ok: true, body };
}

function toBizCompositeKey(bizType, bizId) {
  return `${String(bizType || '').trim().toUpperCase()}|${String(bizId || '').trim()}`;
}

function workKindToBizType(workKind) {
  if (workKind === 'repair') return 'REPAIR';
  if (workKind === 'purchase') return 'PURCHASE';
  if (workKind === 'claim') return 'SUPPLIES_CLAIM';
  return '';
}

async function fetchUnreadBizFlags(keys) {
  if (!keys || !keys.length) return {};
  const res = await springAuth.springRequest({
    url: '/api/notifications/unread-biz-flags',
    method: 'POST',
    data: { keys },
  });
  const pr = parseResponse(res);
  if (!pr.ok) return {};
  return (pr.body.data && pr.body.data.flags) || {};
}

async function markNotificationRead(id) {
  const res = await springAuth.springRequest({
    url: `/api/notifications/${encodeURIComponent(id)}/read`,
    method: 'PATCH',
    data: {},
  });
  return parseResponse(res);
}

async function markReadByBiz(bizType, bizId) {
  const res = await springAuth.springRequest({
    url: '/api/notifications/read-by-biz',
    method: 'PATCH',
    data: { bizType, bizId },
  });
  return parseResponse(res);
}

async function markAllRead() {
  const res = await springAuth.springRequest({
    url: '/api/notifications/read-all',
    method: 'PATCH',
    data: {},
  });
  return parseResponse(res);
}

function syncBadgesAfterRead() {
  return pullPendingBadgeSnapshot({ force: true });
}

module.exports = {
  toBizCompositeKey,
  workKindToBizType,
  fetchUnreadBizFlags,
  markNotificationRead,
  markReadByBiz,
  markAllRead,
  syncBadgesAfterRead,
  parseResponse,
};
