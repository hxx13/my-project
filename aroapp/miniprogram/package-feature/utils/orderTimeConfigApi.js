const springAuth = require('../../utils/springAuth.js');

function parseResponse(res) {
  const { statusCode, data } = res || {};
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false };
    }
  }
  if (statusCode === 401 || statusCode === 403) return { ok: false, message: '无权限访问' };
  if (!body || body.success !== true) return { ok: false, message: (body && body.message) || `请求失败(${statusCode})` };
  return { ok: true, body };
}

async function otRequest(url, method, data) {
  const res = await springAuth.springRequest({ url, method, data: data != null ? data : {} });
  return parseResponse(res);
}

function withQuery(path, params) {
  const parts = [];
  Object.keys(params || {}).forEach(function (k) {
    const v = params[k];
    if (v === undefined || v === null || v === '') return;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  return parts.length ? path + '?' + parts.join('&') : path;
}

/** 管理端策略与规则（按校区）。后端放行 = 超管 或 业务 */
async function fetchAdminPolicy(campus) {
  const p = await otRequest(withQuery('/api/animal-order/time-policy/admin', { campus: campus }), 'GET', {});
  if (!p.ok) throw new Error(p.message);
  return p.body.data || null;
}

/** 保存整份草稿：后端 PUT 是整份替换，必须带上 rules / defaultMode / deletedRuleIds */
async function saveAdminPolicy(body) {
  const p = await otRequest('/api/animal-order/time-policy/admin', 'PUT', body);
  if (!p.ok) throw new Error(p.message);
}

/** 运行时摘要（登录即可读）：canOrderNow / closedReason / nextOpenAt / estimatedDeliveryDate */
async function fetchPolicySummary(campus, categoryKey) {
  const p = await otRequest(
    withQuery('/api/animal-order/time-policy', { campus: campus, categoryKey: categoryKey }),
    'GET',
    {},
  );
  if (!p.ok) throw new Error(p.message);
  return p.body.data || null;
}

/** 品种列表（作用范围选「指定品种」时用） */
async function listBreeds() {
  const p = await otRequest('/api/reference-data/ANIMAL_BREED', 'GET', {});
  if (!p.ok) throw new Error(p.message);
  return p.body.data || [];
}

/** 到货周期（管理端）：{ campus, stored, predicted }。stored 含过期日、空 = 该校区仍按策略推算 */
async function fetchCyclesAdmin(campus) {
  const p = await otRequest(withQuery('/api/reference-data/cycles/admin', { campus: campus }), 'GET', {});
  if (!p.ok) throw new Error(p.message);
  return p.body.data || null;
}

/** 保存到货周期清单：整份替换；传空数组 = 清空，回到「按 ETA 策略推算」 */
async function saveCyclesAdmin(campus, cycles) {
  const p = await otRequest('/api/reference-data/cycles/admin', 'PUT', { campus: campus, cycles: cycles || [] });
  if (!p.ok) throw new Error(p.message);
}

module.exports = {
  fetchAdminPolicy,
  saveAdminPolicy,
  fetchPolicySummary,
  listBreeds,
  fetchCyclesAdmin,
  saveCyclesAdmin,
};
