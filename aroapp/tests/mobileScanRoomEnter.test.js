/**
 * 回归：小程序房间页「移动端自助进入」判据（与 H5 evaluateMobileRoomAccess 同源）。
 * 核心诉求：被违规禁用 / 未绑卡的人在小程序上必须不可点「进入」——移动端不提供任何解禁入口。
 * 漏了 violationEnterLocked 的归一化，取到 undefined → falsy → 按钮照旧可点，点了才被后端拒。
 */
const test = require('node:test');
const assert = require('node:assert');

const {
  normalizeMobileScanAnalyze,
  findScanRoomByOfficialId,
  isRoomEnterable,
  getRoomEnterBlockReason,
} = require('../miniprogram/utils/mobileScanRoomAccess.js');

const base = (extra) =>
  Object.assign(
    {
      success: true,
      currentState: 'OUTSIDE',
      globalUserState: 2,
      allowedRooms: [{ officialRoomId: '9001', displayName: '4F - 401', isDisabled: false }],
      pendingRooms: [],
    },
    extra || {}
  );

const analyzeOf = (extra) => normalizeMobileScanAnalyze(base(extra));
const roomOf = (a) => findScanRoomByOfficialId(a, '9001');

test('违规禁用 → 不可进入，原因「违规处理」（不提供解禁入口）', () => {
  const a = analyzeOf({ studentViolationNotice: { enterLocked: true } });
  assert.equal(a.violationEnterLocked, true);
  assert.equal(isRoomEnterable(roomOf(a), a, null), false);
  assert.equal(getRoomEnterBlockReason(roomOf(a), a, null), '违规处理');
});

test('未绑卡 → 不可进入，原因「未绑卡」', () => {
  const a = analyzeOf({ unboundCardNotice: { enterLocked: true } });
  assert.equal(a.unboundEnterLocked, true);
  assert.equal(isRoomEnterable(roomOf(a), a, null), false);
  assert.equal(getRoomEnterBlockReason(roomOf(a), a, null), '未绑卡');
});

test('无锁定 → 可进入', () => {
  const a = analyzeOf({});
  assert.equal(isRoomEnterable(roomOf(a), a, null), true);
});

test('封禁（globalUserState=3）与状态同步异常 → 不可进入', () => {
  const banned = analyzeOf({ globalUserState: 3 });
  assert.equal(isRoomEnterable(roomOf(banned), banned, null), false);
  const unknown = analyzeOf({ currentState: 'SYNCING' });
  assert.equal(unknown.currentState, 'UNKNOWN');
  assert.equal(isRoomEnterable(roomOf(unknown), unknown, null), false);
  assert.equal(getRoomEnterBlockReason(roomOf(unknown), unknown, null), '状态同步异常');
});

test('满员按同源笼位合并计数判定', () => {
  const a = analyzeOf({});
  const row = { roomId: 56, totalCapacity: 4, capacityBindRoomId: '9001', campusUserCount: 3, borrowedCardCount: 1 };
  assert.equal(isRoomEnterable(roomOf(a), a, row), false);
  assert.equal(getRoomEnterBlockReason(roomOf(a), a, row), '满员');
  assert.equal(isRoomEnterable(roomOf(a), a, Object.assign({}, row, { borrowedCardCount: 0 })), true);
});

test('非开放时段拦截，豁免名单内放行', () => {
  const a = analyzeOf({ scanPopupEntryWindowEnabled: true, scanPopupEntryAllowedNow: false });
  assert.equal(a.scanPopupEntryAllowedNow, false);
  assert.equal(isRoomEnterable(roomOf(a), a, null), false);
  assert.equal(getRoomEnterBlockReason(roomOf(a), a, null), '非开放时段');

  const exempt = analyzeOf({
    scanPopupEntryWindowEnabled: true,
    scanPopupEntryAllowedNow: false,
    scanPopupExemptRoomIds: ['9001'],
  });
  assert.deepEqual(exempt.scanPopupExemptRoomIds, ['9001']);
  assert.equal(isRoomEnterable(roomOf(exempt), exempt, null), true);
});

test('scanPopupEntryAllowedNow 缺省视为开放（与 H5 ?? true 一致）', () => {
  const a = analyzeOf({ scanPopupEntryWindowEnabled: true });
  assert.equal(a.scanPopupEntryAllowedNow, true);
  assert.equal(isRoomEnterable(roomOf(a), a, null), true);
});

test('mobileEnterEnabled 归一化兼容驼峰与下划线', () => {
  assert.equal(analyzeOf({ mobileEnterEnabled: true }).mobileEnterEnabled, true);
  assert.equal(analyzeOf({ mobile_enter_enabled: '1' }).mobileEnterEnabled, true);
  assert.equal(analyzeOf({}).mobileEnterEnabled, false);
});

test('analyze 失败 / 房间不在授权列表 → 均不可进入', () => {
  const failed = normalizeMobileScanAnalyze(Object.assign(base({}), { success: false }));
  assert.equal(isRoomEnterable(roomOf(failed), failed, null), false);
  const a = analyzeOf({});
  assert.equal(isRoomEnterable(null, a, null), false);
  assert.equal(getRoomEnterBlockReason(null, a, null), '无权限');
});
