/**
 * ARO 新闻：
 * 1) 优先 GET /api/public/aro/news（经云函数 springProxy → Spring → JTU），不写死 JTU Token；
 * 2) 失败或正文缺失时回退直连 JTU（utils/request.js），避免云函数/代理链路问题导致列表或富文本（含图片 URL）不完整。
 */
const springAuth = require('./springAuth.js');
const { request } = require('./request.js');
const newsNormalize = require('./aroNewsNormalize.js');

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

/** JTU 原始响应：兼容 data.list / data.records / data 为数组等 */
function extractJtuListBody(body) {
  return newsNormalize.extractJtuListBody(body);
}

function normalizeListRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => newsNormalize.normalizeSummaryRow(row));
}

function extractJtuDetailBody(body) {
  return newsNormalize.extractJtuDetailBody(body);
}

async function fetchNewsListDirect() {
  const body = await request({ url: '/news', method: 'GET' });
  return extractJtuListBody(body);
}

async function fetchNewsDetailDirect(id) {
  const sid = String(id || '').trim();
  const body = await request({ url: `/news/${encodeURIComponent(sid)}`, method: 'GET' });
  if (body && Number(body.status) === 1 && body.message) {
    throw new Error(String(body.message));
  }
  const d = extractJtuDetailBody(body);
  if (!d || Object.keys(d).length === 0) {
    throw new Error((body && body.message) || 'JTU 新闻详情为空');
  }
  return newsNormalize.normalizeDetailForDisplay(d);
}

async function fetchNewsListFromSpring() {
  const res = await springAuth.springRequest({
    url: '/api/public/aro/news',
    method: 'GET',
    data: {},
  });
  const p = parseSpringResult(res);
  if (!p.ok) {
    throw new Error(p.message || '新闻列表加载失败');
  }
  const payload = p.data || {};
  const list = payload.list;
  return normalizeListRows(list);
}

async function fetchNewsDetailFromSpring(id) {
  const res = await springAuth.springRequest({
    url: `/api/public/aro/news/${encodeURIComponent(id)}`,
    method: 'GET',
    data: {},
  });
  const p = parseSpringResult(res);
  if (!p.ok) {
    throw new Error(p.message || '新闻详情加载失败');
  }
  return p.data && typeof p.data === 'object' ? p.data : {};
}

async function fetchNewsList() {
  try {
    return await fetchNewsListFromSpring();
  } catch (e) {
    console.warn('[aroNewsApi] Spring 新闻列表不可用，改直连 JTU', e);
    try {
      const list = normalizeListRows(await fetchNewsListDirect());
      return Array.isArray(list) ? list : [];
    } catch (e2) {
      console.warn('[aroNewsApi] 直连 JTU 列表仍失败', e2);
      throw e2;
    }
  }
}

function hasNewsHtmlContent(detail) {
  return newsNormalize.hasNewsHtmlContent(detail);
}

/** 以 Spring 为准，用 JTU 详情补全/覆盖正文与标题（direct 已 normalize） */
function mergeDetailSpringWithDirect(spring, direct) {
  const base = newsNormalize.normalizeDetailForDisplay(spring || {});
  const jtu = newsNormalize.normalizeDetailForDisplay(direct || {});
  const out = { ...base, ...jtu };
  // 已有 Spring 清洗正文时勿被 JTU 原始 QOWT HTML 覆盖（否则会出现重复+部分带格式）
  if (newsNormalize.hasNewsHtmlContent(base)) {
    out.newsContent = base.newsContent;
    out.newsContentIsArray = base.newsContentIsArray;
  } else if (newsNormalize.hasNewsHtmlContent(jtu)) {
    out.newsContent = jtu.newsContent;
    out.newsContentIsArray = jtu.newsContentIsArray;
  }
  if (!String(out.newsName || '').trim() && String(jtu.newsName || '').trim()) {
    out.newsName = jtu.newsName;
  }
  if (!String(out.createTime || '').trim() && String(jtu.createTime || '').trim()) {
    out.createTime = jtu.createTime;
  }
  if (!String(out.id || '').trim() && String(jtu.id || '').trim()) {
    out.id = jtu.id;
  }
  return out;
}

async function fetchNewsDetail(id) {
  const sid = String(id || '').trim();
  if (!sid) {
    throw new Error('缺少新闻 id');
  }
  let detail = {};
  try {
    detail = await fetchNewsDetailFromSpring(sid);
  } catch (e) {
    console.warn('[aroNewsApi] Spring 新闻详情不可用，改直连 JTU', e);
    return fetchNewsDetailDirect(sid);
  }
  const normalized = newsNormalize.normalizeDetailForDisplay(detail);
  if (!hasNewsHtmlContent(normalized)) {
    try {
      const direct = await fetchNewsDetailDirect(sid);
      if (hasNewsHtmlContent(direct)) {
        return mergeDetailSpringWithDirect(normalized, direct);
      }
    } catch (e2) {
      console.warn('[aroNewsApi] 直连 JTU 补充正文失败（保留 Spring 已有字段）', e2);
    }
  }
  return normalized;
}

module.exports = {
  fetchNewsList,
  fetchNewsDetail,
  normalizeDetailForDisplay: newsNormalize.normalizeDetailForDisplay,
  fetchNewsListFromSpring,
  fetchNewsDetailFromSpring,
  fetchNewsListDirect,
  fetchNewsDetailDirect,
};
