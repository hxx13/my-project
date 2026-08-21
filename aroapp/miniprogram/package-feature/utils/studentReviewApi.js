const springAuth = require('../../utils/springAuth.js');

function unwrap(body) {
  const data = body && typeof body === 'object' ? body : {};
  if (data.success === true || Number(data.code) === 200) return data.data;
  throw new Error(data.message || data.msg || '请求失败');
}

/** 与 Web MaterialReviewPage usePendingMaterialRequests 同源 */
async function fetchPendingMaterialRequests() {
  const res = await springAuth.springRequest({
    url: '/api/material/admin/requests/pending',
    method: 'GET',
    data: {},
  });
  return unwrap(res.data) || [];
}

/** 与 Web fetchFinishedMaterialRequests 同源（物资全部 Tab：仅已审结） */
async function fetchFinishedMaterialRequests(params = { page: 1, size: 50 }) {
  const res = await springAuth.springRequest({
    url: '/api/material/admin/requests/finished',
    method: 'GET',
    data: params,
  });
  return unwrap(res.data) || { data: [], total: 0 };
}

/** @deprecated 管理用途；学生审核「物资全部」请用 fetchFinishedMaterialRequests */
async function fetchAllMaterialRequests(params = { page: 1, size: 50 }) {
  const res = await springAuth.springRequest({
    url: '/api/material/admin/requests/all',
    method: 'GET',
    data: params,
  });
  return unwrap(res.data) || { data: [], total: 0 };
}

/** 与 Web fetchAllMaterialDemands 同源 */
async function fetchAllMaterialDemands(params = { page: 1, size: 200 }) {
  const res = await springAuth.springRequest({
    url: '/api/material/admin/demands',
    method: 'GET',
    data: params,
  });
  return unwrap(res.data) || { data: [], total: 0 };
}

/** 与 Web fetchPendingScanDelayRequests 同源 */
async function fetchPendingScanDelayRequests() {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/scan-delay/request/pending',
    method: 'GET',
    data: {},
  });
  return unwrap(res.data) || [];
}

/** 与 Web fetchScanDelayHistory 同源（已同意/已拒绝，教职工均可查看） */
async function fetchScanDelayHistory(limit = 100) {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/scan-delay/request/history',
    method: 'GET',
    data: { limit },
  });
  return unwrap(res.data) || [];
}

/** 与 Web GET /material/admin/config/demand-entry-visible 同源 */
async function fetchDemandEntryVisible() {
  const res = await springAuth.springRequest({
    url: '/api/material/admin/config/demand-entry-visible',
    method: 'GET',
    data: {},
  });
  const data = unwrap(res.data);
  return !!(data && data.visible);
}

async function approveMaterialRequest(id) {
  const res = await springAuth.springRequest({
    url: `/api/material/admin/requests/${encodeURIComponent(id)}/approve`,
    method: 'POST',
    data: {},
  });
  return unwrap(res.data);
}

async function rejectMaterialRequest(id) {
  const res = await springAuth.springRequest({
    url: `/api/material/admin/requests/${encodeURIComponent(id)}/reject`,
    method: 'POST',
    data: {},
  });
  return unwrap(res.data);
}

async function deleteMaterialRequest(id) {
  const res = await springAuth.springRequest({
    url: `/api/material/admin/requests/${encodeURIComponent(id)}`,
    method: 'DELETE',
    data: {},
  });
  return unwrap(res.data);
}

/** 撤销已通过的审核（与 Web POST /material/admin/requests/{id}/revoke 同源） */
async function revokeMaterialRequest(id) {
  const res = await springAuth.springRequest({
    url: `/api/material/admin/requests/${encodeURIComponent(id)}/revoke`,
    method: 'POST',
    data: {},
  });
  return unwrap(res.data);
}

async function reviewScanDelayRequest(id, approve, rejectReason) {
  const res = await springAuth.springRequest({
    url: `/api/v1/twin/scan-delay/request/${id}/review`,
    method: 'POST',
    data: { approve: !!approve, rejectReason: rejectReason || undefined },
  });
  return unwrap(res.data);
}

async function resolveMaterialDemand(id) {
  const res = await springAuth.springRequest({
    url: `/api/material/admin/demands/${id}`,
    method: 'PATCH',
    data: { status: 1 },
  });
  return unwrap(res.data);
}

async function toggleDemandEntryVisible() {
  const res = await springAuth.springRequest({
    url: '/api/material/admin/config/toggle-demand-entry',
    method: 'POST',
    data: {},
  });
  return unwrap(res.data);
}

/** 与 Web fetchAdminMaterialItems 同源（审核人过滤映射） */
async function fetchAdminMaterialItems() {
  const res = await springAuth.springRequest({
    url: '/api/material/admin/items',
    method: 'GET',
    data: {},
  });
  return unwrap(res.data) || [];
}

/** 与 Web fetchScanDelayOptions 同源（option 审核人映射） */
async function fetchScanDelayOptions() {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/scan-delay/options',
    method: 'GET',
    data: {},
  });
  return unwrap(res.data) || [];
}

module.exports = {
  fetchPendingMaterialRequests,
  fetchFinishedMaterialRequests,
  fetchAllMaterialRequests,
  fetchAllMaterialDemands,
  fetchPendingScanDelayRequests,
  fetchScanDelayHistory,
  fetchDemandEntryVisible,
  fetchAdminMaterialItems,
  fetchScanDelayOptions,
  approveMaterialRequest,
  rejectMaterialRequest,
  deleteMaterialRequest,
  revokeMaterialRequest,
  reviewScanDelayRequest,
  resolveMaterialDemand,
  toggleDemandEntryVisible,
};
