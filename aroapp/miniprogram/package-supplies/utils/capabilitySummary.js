/**
 * GET /api/me/capability-summary：与服务端业务能力策略对齐，用于小程序按钮显隐（勿仅用本地 ROLE 硬编码 SENIOR）。
 */
const springAuth = require('../../utils/springAuth.js');

function parseResponse(res) {
  const { statusCode, data } = res;
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false };
    }
  }
  if (statusCode === 401 || statusCode === 403) return { ok: false };
  if (!body || body.success !== true) return { ok: false };
  return { ok: true, body };
}

let cached = null;
let cachedAt = 0;
const TTL_MS = 60000;

function normalizeRows(body) {
  const list = (body && body.data) || [];
  const map = {};
  (Array.isArray(list) ? list : []).forEach((r) => {
    const d = r && r.bizDomain ? String(r.bizDomain).trim().toUpperCase() : '';
    if (!d) return;
    map[d] = {
      bizDomain: d,
      canSubmit: !!r.canSubmit,
      canProcess: !!r.canProcess,
      canViewAllPending: !!r.canViewAllPending,
      applicantOnlyMineMode: !!r.applicantOnlyMineMode,
    };
  });
  return map;
}

/**
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<Record<string, { bizDomain: string, canSubmit: boolean, canProcess: boolean, canViewAllPending: boolean, applicantOnlyMineMode: boolean }>>}
 */
async function fetchCapabilitySummaryMap(opts) {
  const force = !!(opts && opts.force);
  const token = wx.getStorageSync(springAuth.KEYS.TOKEN);
  if (!token) return {};
  if (!force && cached && Date.now() - cachedAt < TTL_MS) {
    return cached;
  }
  try {
    const res = await springAuth.springRequest({
      url: '/api/me/capability-summary',
      method: 'GET',
      data: {},
    });
    const p = parseResponse(res);
    if (!p.ok) return cached || {};
    const map = normalizeRows(p.body);
    cached = map;
    cachedAt = Date.now();
    return map;
  } catch (e) {
    return cached || {};
  }
}

function resetCapabilitySummaryCache() {
  cached = null;
  cachedAt = 0;
}

module.exports = {
  fetchCapabilitySummaryMap,
  resetCapabilitySummaryCache,
};
