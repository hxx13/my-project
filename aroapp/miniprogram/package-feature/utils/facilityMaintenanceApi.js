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
  if (statusCode === 401 || statusCode === 403) return { ok: false, message: '无权限' };
  if (!body || body.success !== true) return { ok: false, message: (body && body.message) || `请求失败(${statusCode})` };
  return { ok: true, body };
}

async function fmRequest(url, method, data) {
  const res = await springAuth.springRequest({ url, method, data: data != null ? data : {} });
  return parseResponse(res);
}

/** Excel / 二进制：仅当 Spring 返回 200 且云函数包装为 base64 时成功 */
async function fmRequestBinary(url, method, data) {
  const res = await springAuth.springRequest({
    url,
    method: method || 'GET',
    data: data != null ? data : {},
    responseType: 'arraybuffer',
  });
  const { statusCode, data: payload } = res || {};
  if (statusCode === 401 || statusCode === 403) throw new Error('无权限');
  if (statusCode !== 200 || !payload || !payload.isBase64 || !payload.bodyBase64) {
    let msg = '请求失败';
    if (payload && typeof payload === 'object' && payload.message) msg = String(payload.message);
    throw new Error(msg);
  }
  return {
    base64: payload.bodyBase64,
    contentType: payload.contentType || '',
    contentDisposition: payload.contentDisposition || '',
  };
}

async function listSites(includeDisabled) {
  const p = await fmRequest('/api/v1/facility-maintenance/sites', 'GET', {
    includeDisabled: includeDisabled === true,
  });
  if (!p.ok) throw new Error(p.message);
  return p.body.data || [];
}

async function createSite(body) {
  const p = await fmRequest('/api/v1/facility-maintenance/sites', 'POST', body);
  if (!p.ok) throw new Error(p.message);
  return p.body.data;
}

async function patchSite(id, body) {
  const p = await fmRequest(`/api/v1/facility-maintenance/sites/${encodeURIComponent(id)}`, 'PATCH', body || {});
  if (!p.ok) throw new Error(p.message);
}

async function deleteSite(id) {
  const p = await fmRequest(`/api/v1/facility-maintenance/sites/${encodeURIComponent(id)}`, 'DELETE', {});
  if (!p.ok) throw new Error(p.message);
}

async function deleteSitePermanent(id) {
  const p = await fmRequest(`/api/v1/facility-maintenance/sites/${encodeURIComponent(id)}/permanent`, 'DELETE', {});
  if (!p.ok) throw new Error(p.message);
}

async function listOptionSets() {
  const p = await fmRequest('/api/v1/facility-maintenance/option-sets', 'GET', {});
  if (!p.ok) throw new Error(p.message);
  return p.body.data || [];
}

async function createOptionSet(body) {
  const p = await fmRequest('/api/v1/facility-maintenance/option-sets', 'POST', body);
  if (!p.ok) throw new Error(p.message);
  return p.body.data;
}

async function patchOptionSet(id, body) {
  const p = await fmRequest(`/api/v1/facility-maintenance/option-sets/${encodeURIComponent(id)}`, 'PATCH', body || {});
  if (!p.ok) throw new Error(p.message);
}

async function deleteOptionSet(id) {
  const p = await fmRequest(`/api/v1/facility-maintenance/option-sets/${encodeURIComponent(id)}`, 'DELETE', {});
  if (!p.ok) throw new Error(p.message);
}

async function listTemplates(siteId) {
  const p = await fmRequest('/api/v1/facility-maintenance/templates', 'GET', {
    siteId: siteId || '',
  });
  if (!p.ok) throw new Error(p.message);
  return p.body.data || [];
}

async function getTemplate(id) {
  const p = await fmRequest(`/api/v1/facility-maintenance/templates/${encodeURIComponent(id)}`, 'GET', {});
  if (!p.ok) throw new Error(p.message);
  return p.body.data;
}

async function createTemplate(body) {
  const p = await fmRequest('/api/v1/facility-maintenance/templates', 'POST', body);
  if (!p.ok) throw new Error(p.message);
  return p.body.data;
}

async function patchTemplate(id, body) {
  const p = await fmRequest(`/api/v1/facility-maintenance/templates/${encodeURIComponent(id)}`, 'PATCH', body || {});
  if (!p.ok) throw new Error(p.message);
}

async function deleteTemplate(id) {
  const p = await fmRequest(`/api/v1/facility-maintenance/templates/${encodeURIComponent(id)}`, 'DELETE', {});
  if (!p.ok) throw new Error(p.message);
}

async function getOrCreateDailySheet(date, templateId) {
  const q = { date: String(date || '').trim() };
  if (templateId) q.templateId = String(templateId);
  const p = await fmRequest('/api/v1/facility-maintenance/daily-inspection-sheets', 'GET', q);
  if (!p.ok) throw new Error(p.message);
  return p.body.data;
}

async function listDailySheetSummaries(page, size) {
  const p = await fmRequest('/api/v1/facility-maintenance/daily-inspection-sheets/summaries', 'GET', {
    page: page || 1,
    size: size || 20,
  });
  if (!p.ok) throw new Error(p.message);
  return p.body.data || {};
}

async function patchDailySheet(id, body) {
  const p = await fmRequest(
    `/api/v1/facility-maintenance/daily-inspection-sheets/${encodeURIComponent(id)}`,
    'PATCH',
    body || {},
  );
  if (!p.ok) throw new Error(p.message);
  return p.body.data;
}

async function submitDailySheet(id) {
  const p = await fmRequest(
    `/api/v1/facility-maintenance/daily-inspection-sheets/${encodeURIComponent(id)}/submit`,
    'POST',
    {},
  );
  if (!p.ok) throw new Error(p.message);
}

async function deleteDailySheet(id) {
  const p = await fmRequest(`/api/v1/facility-maintenance/daily-inspection-sheets/${encodeURIComponent(id)}`, 'DELETE', {});
  if (!p.ok) throw new Error(p.message);
}

async function exportDailySheetExcel(sheetId) {
  return fmRequestBinary(
    `/api/v1/facility-maintenance/daily-inspection-sheets/${encodeURIComponent(sheetId)}/export-excel`,
    'GET',
    {},
  );
}

async function listConsumableCatalog(includeDisabled) {
  const p = await fmRequest('/api/v1/facility-maintenance/consumable-catalog', 'GET', {
    includeDisabled: includeDisabled === true,
  });
  if (!p.ok) throw new Error(p.message);
  return p.body.data || [];
}

async function createConsumableCatalog(body) {
  const p = await fmRequest('/api/v1/facility-maintenance/consumable-catalog', 'POST', body);
  if (!p.ok) throw new Error(p.message);
  return p.body.data;
}

async function patchConsumableCatalog(id, body) {
  const p = await fmRequest(`/api/v1/facility-maintenance/consumable-catalog/${encodeURIComponent(id)}`, 'PATCH', body || {});
  if (!p.ok) throw new Error(p.message);
}

async function deleteConsumableCatalog(id) {
  const p = await fmRequest(`/api/v1/facility-maintenance/consumable-catalog/${encodeURIComponent(id)}`, 'DELETE', {});
  if (!p.ok) throw new Error(p.message);
}

async function listReplacementPresets(includeDisabled) {
  const p = await fmRequest('/api/v1/facility-maintenance/replacement-filter-presets', 'GET', {
    includeDisabled: includeDisabled === true,
  });
  if (!p.ok) throw new Error(p.message);
  return p.body.data || [];
}

async function createReplacementPreset(body) {
  const p = await fmRequest('/api/v1/facility-maintenance/replacement-filter-presets', 'POST', body);
  if (!p.ok) throw new Error(p.message);
  return p.body.data;
}

async function patchReplacementPreset(id, body) {
  const p = await fmRequest(
    `/api/v1/facility-maintenance/replacement-filter-presets/${encodeURIComponent(id)}`,
    'PATCH',
    body || {},
  );
  if (!p.ok) throw new Error(p.message);
}

async function deleteReplacementPreset(id) {
  const p = await fmRequest(
    `/api/v1/facility-maintenance/replacement-filter-presets/${encodeURIComponent(id)}`,
    'DELETE',
    {},
  );
  if (!p.ok) throw new Error(p.message);
}

async function listInspection(siteId, page, size) {
  const p = await fmRequest('/api/v1/facility-maintenance/inspection-records', 'GET', {
    siteId: siteId || '',
    page: page || 1,
    size: size || 20,
  });
  if (!p.ok) throw new Error(p.message);
  return p.body.data || {};
}

async function createInspection(payload) {
  const p = await fmRequest('/api/v1/facility-maintenance/inspection-records', 'POST', payload);
  if (!p.ok) throw new Error(p.message);
  return p.body.data;
}

async function deleteInspection(id) {
  const p = await fmRequest(`/api/v1/facility-maintenance/inspection-records/${encodeURIComponent(id)}`, 'DELETE', {});
  if (!p.ok) throw new Error(p.message);
}

async function patchInspection(id, payload) {
  const p = await fmRequest(`/api/v1/facility-maintenance/inspection-records/${encodeURIComponent(id)}`, 'PATCH', payload || {});
  if (!p.ok) throw new Error(p.message);
}

async function listConsumables(siteId, page, size) {
  const p = await fmRequest('/api/v1/facility-maintenance/consumable-lines', 'GET', {
    siteId: siteId || '',
    page: page || 1,
    size: size || 20,
  });
  if (!p.ok) throw new Error(p.message);
  return p.body.data || {};
}

async function createConsumable(payload) {
  const p = await fmRequest('/api/v1/facility-maintenance/consumable-lines', 'POST', payload);
  if (!p.ok) throw new Error(p.message);
  return p.body.data;
}

async function deleteConsumable(id) {
  const p = await fmRequest(`/api/v1/facility-maintenance/consumable-lines/${encodeURIComponent(id)}`, 'DELETE', {});
  if (!p.ok) throw new Error(p.message);
}

async function patchConsumable(id, payload) {
  const p = await fmRequest(`/api/v1/facility-maintenance/consumable-lines/${encodeURIComponent(id)}`, 'PATCH', payload || {});
  if (!p.ok) throw new Error(p.message);
}

async function listReplacements(siteId, page, size) {
  const p = await fmRequest('/api/v1/facility-maintenance/replacement-records', 'GET', {
    siteId: siteId || '',
    page: page || 1,
    size: size || 20,
  });
  if (!p.ok) throw new Error(p.message);
  return p.body.data || {};
}

async function createReplacement(payload) {
  const p = await fmRequest('/api/v1/facility-maintenance/replacement-records', 'POST', payload);
  if (!p.ok) throw new Error(p.message);
  return p.body.data;
}

async function createReplacementBatch(payload) {
  const p = await fmRequest('/api/v1/facility-maintenance/replacement-records/batch', 'POST', payload);
  if (!p.ok) throw new Error(p.message);
  return p.body.data || [];
}

async function deleteReplacement(id) {
  const p = await fmRequest(`/api/v1/facility-maintenance/replacement-records/${encodeURIComponent(id)}`, 'DELETE', {});
  if (!p.ok) throw new Error(p.message);
}

async function patchReplacement(id, payload) {
  const p = await fmRequest(`/api/v1/facility-maintenance/replacement-records/${encodeURIComponent(id)}`, 'PATCH', payload || {});
  if (!p.ok) throw new Error(p.message);
}

/** 台账导出 scope: consumables | replacements */
async function exportLedgerExcel(scope) {
  return fmRequestBinary('/api/v1/facility-maintenance/export/excel', 'GET', { scope: scope || 'consumables' });
}

module.exports = {
  listSites,
  createSite,
  patchSite,
  deleteSite,
  deleteSitePermanent,
  listOptionSets,
  createOptionSet,
  patchOptionSet,
  deleteOptionSet,
  listTemplates,
  getTemplate,
  createTemplate,
  patchTemplate,
  deleteTemplate,
  getOrCreateDailySheet,
  listDailySheetSummaries,
  patchDailySheet,
  submitDailySheet,
  deleteDailySheet,
  exportDailySheetExcel,
  listConsumableCatalog,
  createConsumableCatalog,
  patchConsumableCatalog,
  deleteConsumableCatalog,
  listReplacementPresets,
  createReplacementPreset,
  patchReplacementPreset,
  deleteReplacementPreset,
  listInspection,
  createInspection,
  patchInspection,
  deleteInspection,
  listConsumables,
  createConsumable,
  patchConsumable,
  deleteConsumable,
  listReplacements,
  createReplacement,
  createReplacementBatch,
  patchReplacement,
  deleteReplacement,
  exportLedgerExcel,
};
