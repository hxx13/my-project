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

/**
 * 已被订单预定、还没落定的笼位（动物订购锁的笼位）。
 * 这些笼位外观上还是空笼位，网格上必须标出来，否则别的模式会误选。
 * 返回数组：{ reservationId, animalCageId, reserverName, quantity, orderId, cartId }
 */
function fetchActiveCageReservations() {
  return springAuth.springRequest({ url: '/api/animal-order/cage-reservations/active', method: 'GET', data: {} }).then(function(res) {
    var body = res && res.data;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    if (!body || body.success !== true) {
      throw new Error((body && body.message) || '加载笼位预定失败');
    }
    return body.data || [];
  });
}

module.exports = {
  fetchCageOpMarkers: fetchCageOpMarkers,
  fetchActiveCageReservations: fetchActiveCageReservations
};
