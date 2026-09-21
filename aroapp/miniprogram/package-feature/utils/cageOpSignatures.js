/**
 * 转移三签的展示口径（小程序侧唯一一份）。
 *
 * 与后端 CageOpSignatures.ROLES 同序：归属地 → 目的地 → 兽医，并联三签，
 * 任一驳回即终局。暂缓会留下一条签名，但**不算同意**（后端 missingRoles 同口径）——
 * 所以槽位照样显示「暂缓」而不是「已同意」，单据也仍在待审。
 *
 * 网页端 MaterialReviewPage 的 CAGE_OP_SIGN_SLOTS 是同一套语义，改这里记得对一下。
 */

var ROLE_ZH = { ORIGIN: '归属地', DEST: '目的地', VET: '兽医' };
var SIGN_ORDER = ['ORIGIN', 'DEST', 'VET'];

var DECISION_TEXT = { approved: '已同意', held: '暂缓', rejected: '不同意' };
var DECISION_CLASS = { approved: 'sg-ok', held: 'sg-hold', rejected: 'sg-no' };

/** 三个固定槽位，各自 { role, label, text, cls, who }；没签的报「待签」。 */
function signSlots(signatures) {
  var byRole = {};
  (signatures || []).forEach(function (s) {
    if (s && s.role) byRole[s.role] = s;
  });
  return SIGN_ORDER.map(function (role) {
    var s = byRole[role];
    var d = s ? String(s.decision || '') : '';
    return {
      role: role,
      label: ROLE_ZH[role],
      text: DECISION_TEXT[d] || '待签',
      cls: DECISION_CLASS[d] || 'sg-wait',
      who: (s && s.reviewerName) || '',
    };
  });
}

module.exports = { ROLE_ZH: ROLE_ZH, SIGN_ORDER: SIGN_ORDER, signSlots: signSlots };
