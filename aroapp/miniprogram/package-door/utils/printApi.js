/**
 * 打印：可选工位 + 建单/队列/历史/撤回/重推。
 *
 * 【为什么每个函数都自己判 success】springRequest 只在网络层失败时 reject；
 * 权限不足、工位不存在、文件类型不支持这些都是 HTTP 200 + body.success=false。
 * 后端 GlobalExceptionHandler 把 TwinBusinessException 转成 Result 返回，
 * 连 403 也是 HTTP 200 —— 不在这一层判，页面上就会把「被拒」显示成「派发成功」。
 *
 * 六个函数一律不抛异常，统一返回 { ok, message, ... }。
 */
const springAuth = require('../../utils/springAuth.js');

/**
 * 解 HTTP + 业务两层结果。纯函数，不碰 wx。
 * @returns {{ok: boolean, data?: any, message?: string}}
 */
function unwrap(res) {
  const statusCode = Number(res && res.statusCode);
  let body = res ? res.data : null;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = null;
    }
  }
  if (statusCode === 401 || statusCode === 403) return { ok: false, message: '无权限' };
  if (!body || typeof body !== 'object') {
    return { ok: false, message: statusCode === 200 ? '响应无效' : `请求失败 HTTP ${statusCode}` };
  }
  const code = Number(body.code);
  // HTTP 200 但业务码是 401/403：后端异常出口就是这个形态
  if (code === 401 || code === 403) return { ok: false, message: '无权限' };
  const ok = body.success === true || body.success === 'true' || code === 200;
  if (!ok) return { ok: false, message: body.message || '请求失败' };
  return { ok: true, data: body.data, message: body.message };
}

/** 统一收口：网络异常也变成 { ok:false }，不让调用方 try/catch。 */
async function call(options) {
  try {
    return unwrap(await springAuth.springRequest(options));
  } catch (e) {
    return { ok: false, message: (e && e.message) || '网络请求失败' };
  }
}

function asList(data) {
  return Array.isArray(data) ? data : [];
}

/** GET /api/print/stations —— 只返回已启用、给普通人员选打印机用的工位。 */
async function fetchStations() {
  const r = await call({ url: '/api/print/stations', method: 'GET', data: {} });
  return { ok: r.ok, message: r.message, stations: asList(r.data) };
}

/** POST /api/admin/print/jobs */
async function createJob(params) {
  const p = params || {};
  // 后端对 stationId/sourceId 直接 String.valueOf 再查库，缺了只会回一句看不懂的
  // 「工位不存在」；这里先拦一道，toast 出去的话才有意义。
  if (p.stationId == null || String(p.stationId).trim() === '') {
    return { ok: false, message: '未选择打印工位', job: null };
  }
  if (p.sourceId == null || String(p.sourceId).trim() === '') {
    return { ok: false, message: '缺少文件标识', job: null };
  }
  const copies = Number(p.copies);
  const r = await call({
    url: '/api/admin/print/jobs',
    method: 'POST',
    data: {
      stationId: String(p.stationId),
      sourceType: p.sourceType != null ? String(p.sourceType) : '',
      sourceId: String(p.sourceId),
      fileName: p.fileName != null ? String(p.fileName) : '',
      copies: Number.isFinite(copies) && copies > 0 ? copies : 1,
      note: p.note != null ? String(p.note) : '',
      urgent: p.urgent === true,
    },
  });
  return { ok: r.ok, message: r.message, job: r.ok ? r.data || null : null };
}

async function fetchJobs(path, limit) {
  const n = Number(limit);
  const r = await call({
    url: path,
    method: 'GET',
    data: { limit: Number.isFinite(n) && n > 0 ? n : 100 },
  });
  return { ok: r.ok, message: r.message, jobs: asList(r.data) };
}

/** GET /api/admin/print/jobs/queue —— 还没结束的任务。 */
async function fetchQueue(limit = 100) {
  return fetchJobs('/api/admin/print/jobs/queue', limit);
}

/** GET /api/admin/print/jobs/history —— 全部状态。 */
async function fetchHistory(limit = 100) {
  return fetchJobs('/api/admin/print/jobs/history', limit);
}

async function jobAction(id, action) {
  const raw = id == null ? '' : String(id).trim();
  if (!raw) return { ok: false, message: '任务无效' };
  const r = await call({
    url: `/api/admin/print/jobs/${encodeURIComponent(raw)}/${action}`,
    method: 'POST',
    data: {},
  });
  // 失败时后端给的是「只有排队中和失败的任务能撤回…」这类能直接看的文案
  return { ok: r.ok, message: r.ok ? r.message || '操作成功' : r.message || '操作失败' };
}

/** POST /api/admin/print/jobs/{id}/cancel */
async function cancelJob(id) {
  return jobAction(id, 'cancel');
}

/** POST /api/admin/print/jobs/{id}/retry */
async function retryJob(id) {
  return jobAction(id, 'retry');
}

/** GET /api/admin/print/capabilities —— 当前账号能不能清队列（按钮显隐问服务端）。 */
async function fetchCapabilities() {
  const r = await call({ url: '/api/admin/print/capabilities', method: 'GET', data: {} });
  // 学生账号问这个接口是 403，unwrap 已折成 ok:false —— 拿不到能力一律当没有
  return { ok: r.ok, message: r.message, canClearQueue: r.ok && r.data && r.data.canClearQueue === true };
}

/** POST /api/admin/print/stations/{id}/queue/clear —— 清空这台打印机的队列。 */
async function clearStationQueue(stationId) {
  const raw = stationId == null ? '' : String(stationId).trim();
  // 照 createJob 的先例先拦一道，别把空值当路径参数打给后端
  if (!raw) return { ok: false, message: '未选择工位', cleared: 0, cancelled: 0 };
  const r = await call({
    url: `/api/admin/print/stations/${encodeURIComponent(raw)}/queue/clear`,
    method: 'POST',
    data: {},
  });
  const d = (r.ok && r.data) || {};
  return {
    ok: r.ok,
    // 失败时后端带的是「这台工位是『工位电脑执行』，没有可清的服务端队列」这类能直接看的文案
    message: r.ok ? r.message || '操作成功' : r.message || '操作失败',
    cleared: Number(d.cleared) || 0,
    cancelled: Number(d.cancelled) || 0,
  };
}

module.exports = {
  fetchStations,
  createJob,
  fetchQueue,
  fetchHistory,
  cancelJob,
  retryJob,
  fetchCapabilities,
  clearStationQueue,
};
