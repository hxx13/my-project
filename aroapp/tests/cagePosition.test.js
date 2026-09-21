'use strict';
/**
 * 回归：笼位坐标的展示口径（2026-09-21 加）。
 *
 * 后端给的是**原生数字坐标**（positionX 1..26），界面上要的是映射坐标「字母-数字」。
 * 两个页面各写一遍必然走形 —— 实测「我的申请」的转移卡片印了原生 `4-4`，
 * 而同一个单子在审核页显示 `D-4`。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { cagePositionLabel } = require('../miniprogram/package-feature/utils/cagePosition.js');

test('原生数字坐标映射成字母-数字', () => {
  assert.equal(cagePositionLabel({ positionX: 1, positionY: 4 }), 'A-4');
  assert.equal(cagePositionLabel({ positionX: 4, positionY: 4 }), 'D-4');
  assert.equal(cagePositionLabel({ positionX: 26, positionY: 10 }), 'Z-10');
});

test('后端已给 positionLabel 时原样用，不自己再映射一遍', () => {
  assert.equal(cagePositionLabel({ positionLabel: 'D-4', positionX: 4, positionY: 4 }), 'D-4');
});

test('缺坐标或越界返回空串，不硬编一个假坐标', () => {
  assert.equal(cagePositionLabel(null), '');
  assert.equal(cagePositionLabel({}), '');
  assert.equal(cagePositionLabel({ positionX: 4 }), '');
  assert.equal(cagePositionLabel({ positionY: 4 }), '');
  assert.equal(cagePositionLabel({ positionX: 0, positionY: 4 }), '');
  assert.equal(cagePositionLabel({ positionX: 27, positionY: 4 }), '');
});

test('数字以字符串给出也照样映射（dataset 往返不保证类型）', () => {
  assert.equal(cagePositionLabel({ positionX: '4', positionY: '4' }), 'D-4');
});
