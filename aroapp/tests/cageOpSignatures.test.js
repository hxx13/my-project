'use strict';
/**
 * 回归：转移三签进度槽位（2026-09-18 加）。
 *
 * 审核页卡片和「我的转移单」列表共用这一个函数，「一眼看出三关签没签」全靠它。
 * 最容易错的一条：**暂缓要显示成「暂缓」，不能显示成「已同意」** —— 后端 missingRoles
 * 把暂缓算作未决，两边口径一错，界面说已通过、单据却还挂着。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { signSlots, SIGN_ORDER } = require('../miniprogram/package-feature/utils/cageOpSignatures.js');

const byRole = (slots) => Object.fromEntries(slots.map((s) => [s.role, s]));

test('顺序固定为 归属地 → 目的地 → 兽医', () => {
  assert.deepEqual(SIGN_ORDER, ['ORIGIN', 'DEST', 'VET']);
  assert.deepEqual(signSlots([]).map((s) => s.label), ['归属地', '目的地', '兽医']);
});

test('没签过的报「待签」，不报别的', () => {
  const slots = signSlots(null);
  assert.equal(slots.length, 3);
  slots.forEach((s) => {
    assert.equal(s.text, '待签');
    assert.equal(s.cls, 'sg-wait');
    assert.equal(s.who, '');
  });
});

test('三种复核意见各自成态，暂缓不冒充同意', () => {
  const slots = byRole(signSlots([
    { role: 'ORIGIN', decision: 'approved', reviewerName: '张老师' },
    { role: 'DEST', decision: 'held', reviewerName: '李老师' },
    { role: 'VET', decision: 'rejected', reviewerName: '王兽医' },
  ]));
  assert.equal(slots.ORIGIN.text, '已同意');
  assert.equal(slots.ORIGIN.cls, 'sg-ok');
  assert.equal(slots.ORIGIN.who, '张老师');
  assert.equal(slots.DEST.text, '暂缓');
  assert.equal(slots.DEST.cls, 'sg-hold');
  assert.equal(slots.VET.text, '不同意');
  assert.equal(slots.VET.cls, 'sg-no');
});

test('同角色重复签只认最后一条（后端 withSignature 是覆盖式追加）', () => {
  const slots = byRole(signSlots([
    { role: 'ORIGIN', decision: 'held' },
    { role: 'ORIGIN', decision: 'approved', reviewerName: '张老师' },
  ]));
  assert.equal(slots.ORIGIN.text, '已同意');
  assert.equal(slots.ORIGIN.who, '张老师');
});
