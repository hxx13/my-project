const springAuth = require('../../utils/springAuth.js');

/**
 * Excel 二进制：云函数包装为 base64（与 facilityMaintenanceApi.fmRequestBinary 一致）
 */
async function suppliesRequestBinary(path) {
  const res = await springAuth.springRequest({
    url: path,
    method: 'GET',
    data: {},
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
    contentDisposition: payload.contentDisposition || '',
  };
}

async function exportPersonalClaimExcel(claimId) {
  const p = `/api/supplies/claims/${encodeURIComponent(claimId)}/export/personal/excel`;
  return suppliesRequestBinary(p);
}

/** 按申请日期区间导出「领用聚合明细」（无库存列） */
async function exportPersonalClaimsRangeExcel({ from, to, applicantUserId }) {
  let p =
    `/api/supplies/claims/mine-range/export/excel?from=${encodeURIComponent(String(from || '').trim())}` +
    `&to=${encodeURIComponent(String(to || '').trim())}`;
  const aid = applicantUserId != null ? String(applicantUserId).trim() : '';
  if (aid) {
    p += `&applicantUserId=${encodeURIComponent(aid)}`;
  }
  return suppliesRequestBinary(p);
}

async function exportAuditItemExcel(itemId) {
  const p = `/api/supplies/admin/audit/items/${encodeURIComponent(String(itemId))}/export/excel`;
  return suppliesRequestBinary(p);
}

module.exports = {
  exportPersonalClaimExcel,
  exportPersonalClaimsRangeExcel,
  exportAuditItemExcel,
};
