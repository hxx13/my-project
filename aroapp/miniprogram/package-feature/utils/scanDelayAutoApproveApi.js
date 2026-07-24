const springAuth = require('../../utils/springAuth.js');

function unwrap(body) {
  const data = body && typeof body === 'object' ? body : {};
  if (data.success === true || Number(data.code) === 200) return data.data;
  throw new Error(data.message || data.msg || '请求失败');
}

async function fetchScanDelayOptions() {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/scan-delay/options',
    method: 'GET',
    data: {},
  });
  return unwrap(res.data) || [];
}

async function fetchTrustRules() {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/scan-delay/auto-approve/trust-rules',
    method: 'GET',
    data: {},
  });
  return unwrap(res.data) || [];
}

async function fetchBatchRules() {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/scan-delay/auto-approve/batch-rules',
    method: 'GET',
    data: {},
  });
  return unwrap(res.data) || [];
}

async function fetchCandidates() {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/scan-delay/auto-approve/candidates',
    method: 'GET',
    data: {},
  });
  return unwrap(res.data) || [];
}

async function fetchSuggestions() {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/scan-delay/auto-approve/suggestions',
    method: 'GET',
    data: {},
  });
  return unwrap(res.data) || [];
}

async function saveTrustRule(body) {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/scan-delay/auto-approve/trust-rules',
    method: 'PUT',
    data: body,
  });
  return unwrap(res.data);
}

async function saveBatchRule(body) {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/scan-delay/auto-approve/batch-rules',
    method: 'PUT',
    data: {
      ...body,
      optionIds: body.optionIds || [],
      roomIds: body.roomIds || [],
    },
  });
  return unwrap(res.data);
}

async function deleteTrustRule(id) {
  const res = await springAuth.springRequest({
    url: `/api/v1/twin/scan-delay/auto-approve/trust-rules/${id}`,
    method: 'DELETE',
    data: {},
  });
  return unwrap(res.data);
}

async function deleteBatchRule(id) {
  const res = await springAuth.springRequest({
    url: `/api/v1/twin/scan-delay/auto-approve/batch-rules/${id}`,
    method: 'DELETE',
    data: {},
  });
  return unwrap(res.data);
}

async function runAutoApproveNow() {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/scan-delay/auto-approve/run-now',
    method: 'POST',
    data: {},
  });
  return unwrap(res.data);
}

module.exports = {
  fetchScanDelayOptions,
  fetchTrustRules,
  fetchBatchRules,
  fetchCandidates,
  fetchSuggestions,
  saveTrustRule,
  saveBatchRule,
  deleteTrustRule,
  deleteBatchRule,
  runAutoApproveNow,
};
