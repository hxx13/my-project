'use strict';
/**
 * 回归：转移单提交载荷「只发学生动过的值」（2026-09-21 小程序接转移单时加）。
 *
 * 自动值不落库、每次可重算，多发一个自动值 = 把那一刻的自动值冻进单子；
 * 「什么都没动」必须一个字段都不发。行按**下标**与目标对齐（后端按下标取行），
 * 所以只动第 2 行也必须发等长数组，前面没动的行留空对象。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTransferForm } = require('../miniprogram/package-feature/utils/cageTransferForm.js');

test('全空 → 整份 transferForm 都不发', () => {
  assert.equal(buildTransferForm({}, ['1001', '1002']), undefined);
  assert.equal(buildTransferForm(undefined, ['1001']), undefined);
  assert.equal(buildTransferForm({ rows: [] }, ['1001']), undefined);
});

test('只填日期 → 只发 transferDate', () => {
  assert.deepEqual(buildTransferForm({ transferDate: '2026-09-21' }, ['1001']), {
    transferDate: '2026-09-21',
  });
});

test('顶层字段 trim；空串也算「动过」（显式清空要能传下去）', () => {
  assert.deepEqual(buildTransferForm({ phone: ' 13900000000 ', unitName: ' 某大学 ' }, ['1001']), {
    phone: '13900000000',
    unitName: '某大学',
  });
  assert.deepEqual(buildTransferForm({ transferDate: '   ' }, ['1001']), { transferDate: '' });
});

test('数量非法值跳过：负 / 超界 / 空串 / 非数字；合法值取整', () => {
  assert.deepEqual(buildTransferForm({ rows: [{ female: '3.7', male: '5' }] }, ['1001']), {
    rows: [{ female: 3, male: 5 }],
  });
  assert.equal(buildTransferForm({ rows: [{ female: '-2' }] }, ['1001']), undefined);
  assert.equal(buildTransferForm({ rows: [{ male: '100000' }] }, ['1001']), undefined);
  assert.equal(buildTransferForm({ rows: [{ male: '1e21' }] }, ['1001']), undefined);
  assert.equal(buildTransferForm({ rows: [{ female: 'abc', male: '' }] }, ['1001']), undefined);
});

test('rows 等长对齐：只动第二行 → 第一行留空对象', () => {
  assert.deepEqual(buildTransferForm({ rows: [{}, { male: '5' }] }, ['1001', '1002']), {
    rows: [{}, { male: 5 }],
  });
});

test('rows 长度恒等于目标数：edits 多出的行丢弃、缺的行补空对象', () => {
  assert.deepEqual(buildTransferForm({ rows: [{ male: '5' }, { male: '9' }] }, ['1001']), {
    rows: [{ male: 5 }],
  });
  assert.deepEqual(buildTransferForm({ rows: [{ male: '5' }] }, ['1001', '1002']), {
    rows: [{ male: 5 }, {}],
  });
});

test('品系 trim 后进载荷，空串仍算动过（显式清空要能传下去）', () => {
  assert.deepEqual(buildTransferForm({ rows: [{ strain: ' C57BL/6 ' }] }, ['1001']), {
    rows: [{ strain: 'C57BL/6' }],
  });
  assert.deepEqual(buildTransferForm({ rows: [{ strain: '' }] }, ['1001']), {
    rows: [{ strain: '' }],
  });
});
