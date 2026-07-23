const springAuth = require('../../utils/springAuth.js');

function unwrap(body) {
  const data = body && typeof body === 'object' ? body : {};
  if (data.success === true) return data.data;
  throw new Error(data.message || data.msg || '请求失败');
}

async function fetchChannels(params) {
  const res = await springAuth.springRequest({
    url: '/api/v1/dahua/door-control/channels',
    method: 'GET',
    data: params || {},
  });
  return unwrap(res.data) || { list: [], total: 0 };
}

async function executeMode(mode, channelCode) {
  const res = await springAuth.springRequest({
    url: '/api/v1/dahua/door-control/execute',
    method: 'POST',
    data: {
      mode,
      channelCodeList: [channelCode],
    },
  });
  return unwrap(res.data) || {};
}

async function queryStatus(payload) {
  const res = await springAuth.springRequest({
    url: '/api/v1/dahua/door-control/status',
    method: 'POST',
    data: payload || {},
  });
  return unwrap(res.data) || { rows: [] };
}

async function fetchRemarkCategories() {
  const res = await springAuth.springRequest({
    url: '/api/v1/dahua/meta/device-channels/remark-categories',
    method: 'GET',
    data: {},
  });
  const body = res.data && typeof res.data === 'object' ? res.data : {};
  if (body.success === true && Array.isArray(body.data)) return body.data;
  if (Array.isArray(body)) return body;
  if (Array.isArray(res.data)) return res.data;
  return [];
}

module.exports = {
  fetchChannels,
  executeMode,
  queryStatus,
  fetchRemarkCategories,
};
