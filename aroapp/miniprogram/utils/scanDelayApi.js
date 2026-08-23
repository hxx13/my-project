const springAuth = require('./springAuth.js');

function unwrap(body) {
  const data = body && typeof body === 'object' ? body : {};
  if (data.success === true || Number(data.code) === 200) return data.data;
  throw new Error(data.message || data.msg || '提交失败');
}

/** 与 Web submitScanDelayRequest 同源 */
async function submitScanDelayRequest(payload) {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/scan-delay/request',
    method: 'POST',
    data: {
      subjectUserId: payload.subjectUserId,
      roomId: payload.roomId,
      optionId: payload.optionId,
      reviewerUserId: payload.reviewerUserId,
    },
  });
  return unwrap(res.data);
}

/** 查询活跃申请状态（需传 subjectUserId 确保与提交时的刷卡人一致） */
async function fetchMyActiveDelayRequests(roomId, subjectUserId) {
  const params = { roomId };
  if (subjectUserId) params.subjectUserId = subjectUserId;
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/scan-delay/request/my-active',
    method: 'GET',
    data: params,
  });
  const body = res && res.data && typeof res.data === 'object' ? res.data : {};
  if (body.success === true || Number(body.code) === 200) return body.data;
  throw new Error(body.message || '查询失败');
}

module.exports = {
  submitScanDelayRequest,
  fetchMyActiveDelayRequests,
};
