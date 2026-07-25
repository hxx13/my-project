const springAuth = require('../../utils/springAuth.js');

/** 过滤 undefined 值，防止 wx.request 序列化为字符串 "undefined" */
function cleanParams(params) {
  if (!params || typeof params !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

function parseResponse(res) {
  const { statusCode, data } = res || {};
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = { success: false, message: body || '响应解析失败' };
    }
  }
  if (!body || body.success !== true) {
    return { ok: false, message: (body && body.message) || `请求失败(${statusCode})` };
  }
  return { ok: true, body };
}

async function fetchAssetRecords(params) {
  const res = await springAuth.springRequest({
    url: '/api/v1/assets',
    method: 'GET',
    data: cleanParams(params),
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || {};
}

async function searchAssets(keyword, limit) {
  const res = await springAuth.springRequest({
    url: '/api/v1/assets/search',
    method: 'GET',
    data: cleanParams({ keyword, limit: limit || 20 }),
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || [];
}

async function lockAsset(assetId) {
  const res = await springAuth.springRequest({
    url: `/api/v1/assets/${encodeURIComponent(assetId)}/lock`,
    method: 'POST',
    data: {},
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
}

async function submitTransferRequest(payload) {
  const res = await springAuth.springRequest({
    url: '/api/v1/asset-transfer-requests',
    method: 'POST',
    data: payload || {},
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || {};
}

async function appendTransferAfterPhotos(requestId, photoUrls) {
  const res = await springAuth.springRequest({
    url: `/api/v1/asset-transfer-requests/${encodeURIComponent(requestId)}/after-photos`,
    method: 'PATCH',
    data: { photoUrls: photoUrls || [] },
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || {};
}

async function removeTransferAfterPhoto(requestId, photoUrl) {
  const res = await springAuth.springRequest({
    url: `/api/v1/asset-transfer-requests/${encodeURIComponent(requestId)}/after-photos/remove`,
    method: 'POST',
    data: { photoUrls: [photoUrl] },
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || {};
}

async function completeTransferRequest(requestId) {
  const res = await springAuth.springRequest({
    url: `/api/v1/asset-transfer-requests/${encodeURIComponent(requestId)}/complete`,
    method: 'POST',
    data: {},
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || {};
}

async function withdrawTransferRequest(requestId) {
  const res = await springAuth.springRequest({
    url: `/api/v1/asset-transfer-requests/${encodeURIComponent(requestId)}/withdraw`,
    method: 'POST',
    data: {},
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || {};
}

async function deleteTransferRecordAdmin(requestId) {
  const res = await springAuth.springRequest({
    url: `/api/v1/asset-transfer-requests/${encodeURIComponent(requestId)}`,
    method: 'DELETE',
    data: {},
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || {};
}

async function fetchTransferRecords(params) {
  const res = await springAuth.springRequest({
    url: '/api/v1/asset-transfer-records',
    method: 'GET',
    data: cleanParams(params),
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || {};
}

async function createOrReuseTransferPdfLink(requestId) {
  const res = await springAuth.springRequest({
    url: `/api/v1/asset-transfer-records/${encodeURIComponent(requestId)}/pdf-link`,
    method: 'POST',
    data: {},
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || {};
}

async function listTransferPdfLinks(requestId) {
  const res = await springAuth.springRequest({
    url: `/api/v1/asset-transfer-records/${encodeURIComponent(requestId)}/pdf-links`,
    method: 'GET',
    data: {},
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || { requestId, links: [] };
}

async function fetchAssetFacets(params) {
  const res = await springAuth.springRequest({
    url: '/api/v1/assets/facets',
    method: 'GET',
    data: cleanParams(params),
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || { assetNames: [], campuses: [], users: [], models: [] };
}

async function fetchAssetByCode(code) {
  const res = await springAuth.springRequest({
    url: '/api/v1/assets/by-code',
    method: 'GET',
    data: { code },
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || null;
}

async function fetchDistinctLocations() {
  const res = await springAuth.springRequest({
    url: '/api/v1/assets/locations',
    method: 'GET',
    data: {},
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || [];
}

async function createAsset(payload) {
  const res = await springAuth.springRequest({
    url: '/api/v1/assets',
    method: 'POST',
    data: payload || {},
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || {};
}

async function patchAssetRecord(assetId, payload) {
  const res = await springAuth.springRequest({
    url: `/api/v1/assets/${encodeURIComponent(assetId)}`,
    method: 'PATCH',
    data: payload || {},
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || {};
}

async function exportAssetExcel(params) {
  const token = wx.getStorageSync(springAuth.KEYS.TOKEN) || '';
  const authorization = token ? `Bearer ${token}` : '';
  const res = await springAuth.callSpringDirect({
    path: '/api/v1/assets/export',
    method: 'GET',
    data: params || {},
    authorization,
    responseType: 'arraybuffer',
  });
  if (!res || Number(res.statusCode) !== 200) {
    throw new Error(`导出失败(${res && res.statusCode ? res.statusCode : 0})`);
  }
  if (!res.data || res.data.isBase64 !== true || !res.data.bodyBase64) {
    throw new Error('导出数据格式错误');
  }
  return String(res.data.bodyBase64);
}

async function batchUpdateAssets(payload) {
  const res = await springAuth.springRequest({
    url: '/api/v1/assets/batch',
    method: 'PATCH',
    data: payload || {},
  });
  const parsed = parseResponse(res);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.body.data || {};
}

module.exports = {
  fetchAssetRecords,
  searchAssets,
  fetchAssetByCode,
  fetchDistinctLocations,
  createAsset,
  lockAsset,
  submitTransferRequest,
  appendTransferAfterPhotos,
  removeTransferAfterPhoto,
  completeTransferRequest,
  withdrawTransferRequest,
  deleteTransferRecordAdmin,
  fetchTransferRecords,
  createOrReuseTransferPdfLink,
  listTransferPdfLinks,
  fetchAssetFacets,
  patchAssetRecord,
  batchUpdateAssets,
  exportAssetExcel,
};

