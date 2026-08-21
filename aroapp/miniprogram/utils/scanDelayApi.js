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

module.exports = {
  submitScanDelayRequest,
};
