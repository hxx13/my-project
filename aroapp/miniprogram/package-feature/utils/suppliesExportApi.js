const springAuth = require('../../utils/springAuth.js');

/**
 * 领用审计导出。
 *
 * 统一走 springAuth.springRequestBinary（直连 Spring 取 ArrayBuffer）。
 * 旧版按云函数 {isBase64, bodyBase64} 协议解析，改直连后那层包装已不存在，必然报「请求失败」。
 *
 * 返回 { data: ArrayBuffer, contentDisposition }，调用方用
 * springAuth.saveAndOpenDocument(data, 文件名, 'xlsx') 落盘并打开。
 */

function exportPersonalClaimExcel(claimId) {
  const p = `/api/supplies/claims/${encodeURIComponent(String(claimId))}/export/personal/excel`;
  return springAuth.springRequestBinary(p, { forbiddenMessage: '无权限导出' });
}

/** 按申请日期区间导出「领用聚合明细」（无库存列） */
function exportPersonalClaimsRangeExcel({ from, to, applicantUserId }) {
  let p =
    `/api/supplies/claims/mine-range/export/excel?from=${encodeURIComponent(String(from || '').trim())}` +
    `&to=${encodeURIComponent(String(to || '').trim())}`;
  const aid = applicantUserId != null ? String(applicantUserId).trim() : '';
  if (aid) {
    p += `&applicantUserId=${encodeURIComponent(aid)}`;
  }
  return springAuth.springRequestBinary(p, { forbiddenMessage: '无权限导出' });
}

function exportAuditItemExcel(itemId) {
  const p = `/api/supplies/admin/audit/items/${encodeURIComponent(String(itemId))}/export/excel`;
  return springAuth.springRequestBinary(p, { forbiddenMessage: '无权限导出' });
}

module.exports = {
  exportPersonalClaimExcel,
  exportPersonalClaimsRangeExcel,
  exportAuditItemExcel,
};
