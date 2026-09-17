/**
 * 回归：房间页顶部权限角标的口径（2026-09-17 改）。
 *
 * 原口径是「当前人员状态」，产品确认不再使用；现在只表示**当前时段能否进入**：
 * 能进 = 正常，不能进 = 非开放时间段。判据与 H5 扫码弹窗同源
 * （scanPopupEntryWindowEnabled && !scanPopupEntryAllowedNow），不看房间豁免名单
 * ——那是逐房间的判定（isRoomEntryTimeBlocked）。
 *
 * 漏了归一化就会取到 undefined → falsy → 非开放时段还显示「正常」，与该提示同时出现自相矛盾。
 */
const test = require('node:test');
const assert = require('node:assert');

const { computePermissionBadge } = require('../miniprogram/utils/twinScanAnalyze.js');

const USER = 'STAFF_x';
const analyze = (dto) => ({
  httpOk: true,
  envelopeOk: true,
  dto: Object.assign({ success: true, globalUserState: 2 }, dto),
});

test('角标：时段窗口启用且当前不可进 → 非开放时间段', () => {
  const r = computePermissionBadge({
    userId: USER,
    parsedAnalyze: analyze({ scanPopupEntryWindowEnabled: true, scanPopupEntryAllowedNow: false }),
  });
  assert.equal(r.key, 'closed');
  assert.equal(r.text, '非开放时间段');
});

test('角标：窗口启用且当前可进 → 正常', () => {
  const r = computePermissionBadge({
    userId: USER,
    parsedAnalyze: analyze({ scanPopupEntryWindowEnabled: true, scanPopupEntryAllowedNow: true }),
  });
  assert.deepEqual(r, { key: 'ok', text: '正常' });
});

test('角标：窗口未启用 / 字段缺失 → 视为开放，不误报非开放时段', () => {
  const off = computePermissionBadge({
    userId: USER,
    parsedAnalyze: analyze({ scanPopupEntryWindowEnabled: false, scanPopupEntryAllowedNow: false }),
  });
  assert.equal(off.key, 'ok');
  const missing = computePermissionBadge({ userId: USER, parsedAnalyze: analyze({}) });
  assert.equal(missing.key, 'ok');
});

test('角标：禁用优先于时段；无 userId / 请求失败 → 无权限（原语义保留）', () => {
  const banned = computePermissionBadge({
    userId: USER,
    parsedAnalyze: analyze({
      globalUserState: 3,
      scanPopupEntryWindowEnabled: true,
      scanPopupEntryAllowedNow: false,
    }),
  });
  assert.deepEqual(banned, { key: 'banned', text: '禁用' });
  assert.equal(computePermissionBadge({ userId: '', parsedAnalyze: analyze({}) }).key, 'none');
  assert.equal(
    computePermissionBadge({ userId: USER, parsedAnalyze: { httpOk: false, envelopeOk: true, dto: null } }).key,
    'none',
  );
});
