const springAuth = require('../../utils/springAuth.js');

function unwrap(body) {
  const data = body && typeof body === 'object' ? body : {};
  if (data.success === true) return data.data;
  const msg = data.message || data.msg || '请求失败';
  throw new Error(msg);
}

async function getMappings(page, pageSize) {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/mappings',
    method: 'GET',
    data: { page, pageSize },
  });
  return unwrap(res.data);
}

async function searchMappings(keyword) {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/mappings/search',
    method: 'GET',
    data: { keyword },
  });
  return unwrap(res.data) || [];
}

async function updateCardStatus(cardNo, status) {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/mappings/status',
    method: 'POST',
    data: { cardNo, status },
  });
  return unwrap(res.data);
}

async function updateExempt(cardNo, flag, durationMinutes, mode, maxCount, roomIds, extendUntilTime) {
  const data = { cardNo, flag };
  if (flag === 1) {
    if (mode) data.mode = mode;
    if (extendUntilTime) data.extendUntilTime = extendUntilTime;
    else if (durationMinutes != null) data.durationMinutes = durationMinutes;
    if (maxCount != null) data.maxCount = maxCount;
    if (roomIds) data.roomIds = roomIds;
  }
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/mappings/exempt',
    method: 'POST',
    data,
  });
  return unwrap(res.data);
}

async function deleteMapping(cardNo) {
  const res = await springAuth.springRequest({
    url: `/api/v1/twin/mappings/${encodeURIComponent(cardNo)}`,
    method: 'DELETE',
    data: {},
  });
  return unwrap(res.data);
}

async function searchPersonnel(keyword) {
  const debug = {
    directStatus: null,
    directCount: 0,
    directError: '',
    fallbackStatus: null,
    fallbackCount: 0,
    fallbackError: '',
  };
  const parseRows = (payload) => {
    const statusCode = payload && typeof payload.statusCode === 'number' ? payload.statusCode : 200;
    if (statusCode !== 200) {
      throw new Error(`人员检索接口异常(HTTP ${statusCode})`);
    }
    const body = payload && payload.data ? payload.data : payload;
    if (body && typeof body === 'object' && body.success === false) {
      const msg = body.message || body.msg || '人员检索失败';
      throw new Error(String(msg));
    }
    const data = body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')
      ? body.data
      : body;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.list)) return data.list;
    if (data && Array.isArray(data.rows)) return data.rows;
    if (data && Array.isArray(data.records)) return data.records;
    if (data && data.data && Array.isArray(data.data.list)) return data.data.list;
    if (body && typeof body === 'object' && Array.isArray(body.list)) return body.list;
    if (body && typeof body === 'object' && Array.isArray(body.rows)) return body.rows;
    return [];
  };

  // 第一跳：对齐 web 端风格，query 直连且不附带 Authorization
  let rows = [];
  try {
    const direct = await springAuth.callSpringProxy({
      path: `/api/v1/twin/dashboard/personnel/search?keyword=${encodeURIComponent(keyword)}&limit=20&_t=${Date.now()}`,
      method: 'GET',
      data: {},
      authorization: '',
    });
    debug.directStatus = direct && typeof direct.statusCode === 'number' ? direct.statusCode : null;
    rows = parseRows(direct);
    debug.directCount = rows.length;
    if (rows.length > 0) return { rows, debug };
  } catch (e) {
    debug.directError = e && e.message ? String(e.message) : 'direct request failed';
  }

  // 第二跳兜底：走带 Bearer 的 springRequest（部分环境需鉴权）
  try {
    const fallback = await springAuth.springRequest({
      url: '/api/v1/twin/dashboard/personnel/search',
      method: 'GET',
      data: { keyword, limit: 20 },
    });
    debug.fallbackStatus = fallback && typeof fallback.statusCode === 'number' ? fallback.statusCode : null;
    rows = parseRows(fallback);
    debug.fallbackCount = rows.length;
    return { rows, debug };
  } catch (e) {
    debug.fallbackError = e && e.message ? String(e.message) : 'fallback request failed';
    return { rows: [], debug };
  }
}

async function fetchDepartments(keyword) {
  const res = await springAuth.springRequest({
    url: '/api/v1/dahua/meta/departments',
    method: 'GET',
    data: { page: 1, pageSize: 200, keyword: keyword || '' },
  });
  return unwrap(res.data) || { list: [], total: 0 };
}

async function fetchDoorGroups(keyword) {
  const res = await springAuth.springRequest({
    url: '/api/v1/dahua/meta/door-groups',
    method: 'GET',
    data: { page: 1, pageSize: 200, keyword: keyword || '' },
  });
  return unwrap(res.data) || { list: [], total: 0 };
}

async function fetchChannels(keyword) {
  const res = await springAuth.springRequest({
    url: '/api/v1/dahua/meta/device-channels',
    method: 'GET',
    data: { page: 1, pageSize: 200, keyword: keyword || '' },
  });
  return unwrap(res.data) || { list: [], total: 0 };
}

async function issueCard(payload) {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/mappings/dahua-issue',
    method: 'POST',
    data: payload,
  });
  return unwrap(res.data) || {};
}

async function fetchIssueAccessPrefill(aroUserId) {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/mappings/dahua-issue/access-prefill',
    method: 'GET',
    data: { aroUserId },
  });
  return unwrap(res.data) || {};
}

module.exports = {
  getMappings,
  searchMappings,
  updateCardStatus,
  updateExempt,
  deleteMapping,
  searchPersonnel,
  fetchDepartments,
  fetchDoorGroups,
  fetchChannels,
  issueCard,
  fetchIssueAccessPrefill,
};
