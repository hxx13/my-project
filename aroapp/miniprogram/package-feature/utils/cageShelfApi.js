/* 笼位相关接口（对齐 frontend/src/api/domains/cageShelf.api.ts） */
var springAuth = require('../../utils/springAuth.js');

/**
 * 待审分笼/转移标记。已按身份过滤：学生只拿到自己提交的，教职工拿到全部。
 * 返回数组：{ id, opType, sourceAnimalCageId, targetAnimalCageIds, ... }
 */
function fetchCageOpMarkers() {
  return springAuth.springRequest({ url: '/api/cage-op/markers', method: 'GET', data: {} }).then(function(res) {
    var body = res && res.data;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    if (!body || body.success !== true) {
      throw new Error((body && body.message) || '加载待审分笼/转移失败');
    }
    return body.data || [];
  });
}

module.exports = {
  fetchCageOpMarkers: fetchCageOpMarkers
};
