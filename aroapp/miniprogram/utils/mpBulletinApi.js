/**
 * 首页「公告」合并列表：GET /api/public/mp-home/bulletins（经 springProxy，前缀已在默认白名单）。
 */
const springAuth = require('./springAuth.js');

function parseSpringResult(res) {
  const statusCode = Number(res && res.statusCode);
  let body = res ? res.data : null;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false, message: body || '响应解析失败' };
    }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { ok: false, message: (body && body.message) || '无权限访问' };
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode || 0})` };
  }
  return { ok: true, data: body.data };
}

function kindLabel(kind) {
  if (kind === 'release') return '版本';
  if (kind === 'announcement') return '公告';
  return '';
}

async function fetchBulletinList() {
  const res = await springAuth.springRequest({
    url: '/api/public/mp-home/bulletins',
    method: 'GET',
    data: {},
  });
  const p = parseSpringResult(res);
  if (!p.ok) {
    throw new Error(p.message || '公告列表加载失败');
  }
  const list = Array.isArray(p.data) ? p.data : [];
  return list.map((x) => ({
    ...x,
    kindLabel: kindLabel(x.kind),
  }));
}

async function fetchBulletinDetail(id, kind) {
  const q = `kind=${encodeURIComponent(kind)}`;
  const res = await springAuth.springRequest({
    url: `/api/public/mp-home/bulletins/${encodeURIComponent(id)}?${q}`,
    method: 'GET',
    data: {},
  });
  const p = parseSpringResult(res);
  if (!p.ok) {
    throw new Error(p.message || '详情加载失败');
  }
  return p.data && typeof p.data === 'object' ? p.data : {};
}

module.exports = {
  fetchBulletinList,
  fetchBulletinDetail,
};
