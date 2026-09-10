const springAuth = require('../../utils/springAuth.js');

/**
 * 订单 Excel 导出（小程序端）。
 *
 * 复用 springAuth.springRequestBinary（直连 Spring 取 ArrayBuffer），
 * 不再自己解析响应——旧写法照抄 suppliesExportApi 的 {isBase64, bodyBase64} 协议，
 * 那是云函数中转时代的产物，改直连后那层包装已不存在。
 *
 * 学生/教职工端走「本课题组」接口：范围由服务端圈定，前端传的课题组会被忽略。
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

/** 导出本课题组订单，返回 ArrayBuffer。 */
async function exportMyGroupOrdersExcel(params) {
  const path = '/api/reference-data/orders/my-group/export' + buildQuery(params);
  const { data } = await springAuth.springRequestBinary(path, {
    errorMessage: '导出失败',
    forbiddenMessage: '无权限导出',
  });
  return data;
}

module.exports = {
  exportMyGroupOrdersExcel,
};
