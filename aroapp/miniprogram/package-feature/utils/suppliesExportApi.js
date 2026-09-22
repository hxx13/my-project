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

/**
 * 生成/复用《实验动物科学部内部物品领用单》的分享链接。
 *
 * 返回 data.downloadToken —— 领用单归档在私有目录，静态地址拉不到，只能凭令牌走后端端点。
 * 出库后拿到的是出库那一刻归档的那一份（带出库人签名）；出库前预览会重新渲染。
 */
async function createClaimPdfLink(claimId) {
  const p = `/api/supplies/claims/${encodeURIComponent(String(claimId))}/pdf-link`;
  const res = await springAuth.springRequest({ url: p, method: 'POST', data: {} });
  const body = res && res.data ? res.data : {};
  // 写请求必须看 success：HTTP 200 + success:false 也是失败（不看就会把「被拦」当成功）
  if (!body.success) throw new Error(body.message || '生成领用单失败');
  return body.data || {};
}

/** 按令牌取领用单 PDF 字节（ArrayBuffer），交给 saveAndOpenDocument 落盘打开。 */
function fetchClaimFormPdf(downloadToken) {
  const p = `/api/supplies/claims/download/${encodeURIComponent(String(downloadToken))}`;
  return springAuth.springRequestBinary(p, { errorMessage: '打开领用单失败' });
}

module.exports = {
  exportPersonalClaimExcel,
  exportPersonalClaimsRangeExcel,
  exportAuditItemExcel,
  createClaimPdfLink,
  fetchClaimFormPdf,
};
