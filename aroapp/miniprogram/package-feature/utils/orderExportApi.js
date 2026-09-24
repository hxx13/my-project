const springAuth = require('../../utils/springAuth.js');

/**
 * 订单 Excel 导出（小程序端）。
 *
 * 复用 springAuth.springRequestBinary（直连 Spring 取 ArrayBuffer），
 * 不再自己解析响应——旧写法照抄 suppliesExportApi 的 {isBase64, bodyBase64} 协议，
 * 那是云函数中转时代的产物，改直连后那层包装已不存在。
 *
 * 导出走 `/orders/export` —— 与列表同源，**服务端自适应**：业务标签/超管导出全量，
 * 其余身份只导出本人课题组。别改回 `/orders/my-group/export`，那条会把超管也锁在本组。
 */

function buildQuery(params) {
  const src = params || {};
  const keys = Object.keys(src).filter(function (k) {
    const v = src[k];
    return v !== undefined && v !== null && String(v).trim() !== '';
  });
  if (!keys.length) return '';
  return '?' + keys.map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(String(src[k]).trim());
  }).join('&');
}

/** 导出订单（范围由服务端按身份决定），返回 ArrayBuffer。 */
async function exportOrdersExcel(params) {
  const path = '/api/reference-data/orders/export' + buildQuery(params);
  const { data } = await springAuth.springRequestBinary(path, {
    errorMessage: '导出失败',
    forbiddenMessage: '无权限导出',
  });
  return data;
}

module.exports = {
  exportOrdersExcel,
};
