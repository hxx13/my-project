/**
 * 笼位特殊状态动作 — 小程序唯一来源，与前端 CAGE_BOX_ACTIONS 对齐。
 * 一个状态四处命名在此集中：UI 动作名 / 表单 canonical(snake) / statusPhotos key(=snake) / 展示色。
 * 状态标记唯一真相源是表单 cage_info_value（canonical=snake_case），
 * 禁止再读 cage_cell_detail 的 camelCase 字段（已删 detailKey）。
 *
 * 自检：`node utils/cageStatus.js`
 */
var CAGE_STATUS_ACTIONS = [
  { action: 'DIVIDE',           statusField: 'needs_division',         label: '需分笼',  color: '#eab308', bg: '#fef08a' },
  { action: 'SPECIAL_BREEDING', statusField: 'needs_special_feeding',  label: '需特殊饲养', color: '#ef4444', bg: '#fecaca' },
  { action: 'HEALTH_CHECK',     statusField: 'has_health_abnormality', label: '健康异常', color: '#a855f7', bg: '#e9d5ff' },
  { action: 'COHABITATION',     statusField: 'needs_cohabitation',     label: '需合笼',  color: '#f97316', bg: '#fed7aa' },
  { action: 'TRANSFER',         statusField: 'needs_transfer',         label: '动物转移', color: '#06b6d4', bg: '#cffafe' }
];

var byAction = {};
CAGE_STATUS_ACTIONS.forEach(function (a) {
  byAction[a.action] = a;
  // lastScannedEntry 的扁平键（act_<ACTION>），供 wxml 里 lastScannedEntry[item._actKey] 绑定
  a._actKey = 'act_' + a.action;
});

function truthy(v) { return v === true || v === 1 || v === '1'; }

/** 新建一个全 false 的动作状态对象（scanCache / detailActions / editActionCurrent 通用） */
function newActionState() {
  var s = {};
  CAGE_STATUS_ACTIONS.forEach(function (a) { s[a.action] = false; });
  return s;
}

/** 从表单值(cage_info_value)读已开启状态 —— 状态标记唯一真相源（canonical=snake_case） */
function actionsFromFormValues(rows) {
  var s = newActionState();
  if (!rows) return s;
  var byCanonical = {};
  rows.forEach(function (r) { if (r && r.canonical != null) byCanonical[r.canonical] = r.value; });
  CAGE_STATUS_ACTIONS.forEach(function (a) {
    if (truthy(byCanonical[a.statusField])) s[a.action] = true;
  });
  return s;
}

/** 从 ARO 笼盒快照读已开启状态（本地专有状态无 aro 字段，读不到） */
function actionsFromCageBoxInfo(cbi, cvo) {
  var s = newActionState();
  var byActionMap = { DIVIDE: 'NeedDivideYn', SPECIAL_BREEDING: 'NeedFeedingYn', HEALTH_CHECK: 'AbnormalHealthYn', TRANSFER: 'NeedTransferYn' };
  CAGE_STATUS_ACTIONS.forEach(function (a) {
    var yn = byActionMap[a.action];
    if (!yn) return;
    var camel = yn.charAt(0).toLowerCase() + yn.slice(1);
    if (truthy(cbi && cbi[yn]) || truthy(cvo && cvo[camel])) s[a.action] = true;
  });
  return s;
}

/** 动作名 → 后端 toggle 字段 */
function statusField(action) {
  var a = byAction[action];
  return a ? a.statusField : action;
}

/** 已开启状态对应的 statusPhotos key 列表（照片按已开启状态归档，入参为 {action: bool}） */
function statusPhotoKeys(activeActions) {
  if (!activeActions) return [];
  return CAGE_STATUS_ACTIONS.filter(function (a) { return truthy(activeActions[a.action]); }).map(function (a) { return a.statusField; });
}

/** 切换动作状态，返回新对象 */
function toggleAction(state, action) {
  var next = {};
  for (var k in state) next[k] = state[k];
  if (byAction[action]) next[action] = !next[action];
  return next;
}

/** lastScannedEntry 专用：act_<ACTION> → false 的扁平键（供 wxml 绑定） */
function newActionStateKeys() {
  var s = {};
  CAGE_STATUS_ACTIONS.forEach(function (a) { s['act_' + a.action] = false; });
  return s;
}

module.exports = {
  CAGE_STATUS_ACTIONS: CAGE_STATUS_ACTIONS,
  byAction: byAction,
  newActionState: newActionState,
  newActionStateKeys: newActionStateKeys,
  actionsFromFormValues: actionsFromFormValues,
  actionsFromCageBoxInfo: actionsFromCageBoxInfo,
  statusField: statusField,
  statusPhotoKeys: statusPhotoKeys,
  toggleAction: toggleAction
};

if (typeof require !== 'undefined' && require.main === module) {
  var assert = require('assert');

  assert.strictEqual(CAGE_STATUS_ACTIONS.length, 5);
  assert.strictEqual(statusField('TRANSFER'), 'needs_transfer');
  assert.strictEqual(statusField('COHABITATION'), 'needs_cohabitation');
  assert.strictEqual(statusField('UNKNOWN'), 'UNKNOWN');

  var s0 = newActionState();
  assert.deepStrictEqual(Object.keys(s0).sort(), ['COHABITATION', 'DIVIDE', 'HEALTH_CHECK', 'SPECIAL_BREEDING', 'TRANSFER']);
  assert.strictEqual(s0.DIVIDE, false);

  var rows = [{ canonical: 'needs_division', value: true }, { canonical: 'needs_transfer', value: 1 }, { canonical: 'needs_cohabitation', value: false }];
  var s = actionsFromFormValues(rows);
  assert.strictEqual(s.DIVIDE, true);
  assert.strictEqual(s.TRANSFER, true);
  assert.strictEqual(s.COHABITATION, false);
  assert.deepStrictEqual(statusPhotoKeys(s).sort(), ['needs_division', 'needs_transfer']);

  var t = toggleAction(s0, 'COHABITATION');
  assert.strictEqual(t.COHABITATION, true);
  assert.strictEqual(s0.COHABITATION, false, '切换不改原对象');

  console.log('cageStatus self-check OK');
}
