'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  setUserColors, colorFor, getCellStyle, enrichGridCell, buildGrid,
  getDominantStatusCode, buildReserveMarks, applyReserveMarks,
  CAGE_TYPE_DOT_COLOR, CAGE_TYPE_ABBR,
} = require('../miniprogram/package-feature/utils/cageCellVisual.js');

// ---------------------------------------------------------------- 状态优先级表
// getCellStyle 里 NORMAL 会被跳过、走不到优先级表，所以优先级必须单独在
// getDominantStatusCode 上验：多状态并存时按 STATUS_BG_PRIORITY 取最高的那个。
test('getDominantStatusCode: 多状态按优先级取最高的', () => {
  assert.equal(
    getDominantStatusCode([{ code: 'COHABITATION' }, { code: 'HEALTH_ABNORMAL' }]),
    'HEALTH_ABNORMAL',
    '疾病优先级高于合笼'
  );
  assert.equal(
    getDominantStatusCode([{ code: 'COHABITATION' }, { code: 'SPECIAL_FEEDING' }]),
    'SPECIAL_FEEDING',
    '特殊饲养优先级高于合笼'
  );
});

test('getDominantStatusCode: NORMAL 与其它并存时让位', () => {
  assert.equal(getDominantStatusCode([{ code: 'NORMAL' }, { code: 'COHABITATION' }]), 'COHABITATION');
  assert.equal(getDominantStatusCode([{ code: 'NORMAL' }]), 'NORMAL');
  assert.equal(getDominantStatusCode([]), 'NORMAL', '无状态数据按 NORMAL');
});

// ---------------------------------------------------------------- 配色
test('colorFor: 默认 NORMAL 色', () => {
  assert.deepEqual(colorFor('NORMAL'), { bg: '#f1f5f9', border: '#cbd5e1' });
});

test('colorFor: 未知码回落 NORMAL', () => {
  assert.deepEqual(colorFor('XXX_不存在'), colorFor('NORMAL'));
});

test('setUserColors: 注入覆盖默认色，null 恢复（用完清回，避免污染其它用例）', () => {
  setUserColors({ NORMAL: { bg: '#123456', border: '#654321' } });
  assert.equal(colorFor('NORMAL').bg, '#123456');
  setUserColors(null);
  assert.equal(colorFor('NORMAL').bg, '#f1f5f9');
});

// ---------------------------------------------------------------- getCellStyle
test('getCellStyle: 空格位底色 + 描边', () => {
  const s = getCellStyle({ empty: true });
  assert.ok(s.includes('background-color: #f1f5f9'));
  assert.ok(s.includes('border: 1px solid #cbd5e1'));
});

test('getCellStyle: 单状态取该状态底色', () => {
  const s = getCellStyle({ specialStatuses: [{ code: 'HEALTH_ABNORMAL' }] });
  assert.ok(s.includes('background-color: #e9d5ff'));
});

test('getCellStyle: 两个状态走渐变，两色都在', () => {
  const s = getCellStyle({
    specialStatuses: [{ code: 'HEALTH_ABNORMAL' }, { code: 'NEED_DIVIDE' }],
  });
  assert.ok(s.includes('linear-gradient(to bottom,'));
  assert.ok(s.includes('#e9d5ff'));
  assert.ok(s.includes('#fef08a'));
});

test('getCellStyle: 特殊饲养明细(SF_*)不占底色，两状态各分一半', () => {
  // E-10 实况：2 个真状态 + 4 条明细。明细曾经也各占一份，colorFor 查不到色回退成
  // NORMAL 灰(#f1f5f9)，把两个真状态挤到格子顶上 1/3。明细只画右上角角标，不参与分色。
  const s = getCellStyle({
    specialStatuses: [
      { code: 'SPECIAL_FEEDING' }, { code: 'HEALTH_ABNORMAL' },
      { code: 'SF_NEED_FEED' }, { code: 'SF_NO_FEED' },
      { code: 'SF_NEED_WATER' }, { code: 'SF_NO_WATER' },
    ],
  });
  assert.equal(
    s,
    'background: linear-gradient(to bottom, #fecaca 0%, #fecaca 50%, #e9d5ff 50%, #e9d5ff 100%); border: 1px solid #cbd5e1;'
  );
  assert.ok(!s.includes('#f1f5f9'), '不该混进 NORMAL 灰');
});

test('getCellStyle: 多状态优先级取 HEALTH_ABNORMAL（优先级表排最前）', () => {
  const s = getCellStyle({
    specialStatuses: [{ code: 'NORMAL' }, { code: 'HEALTH_ABNORMAL' }],
  });
  assert.ok(s.includes('background-color: #e9d5ff'));
});

// ---------------------------------------------------------------- enrichGridCell
test('enrichGridCell: 位号 A-1↔A-10 反转', () => {
  assert.equal(enrichGridCell({ position: 'A-1' })._displayPosition, 'A-10');
  assert.equal(enrichGridCell({ position: 'A-10' })._displayPosition, 'A-1');
});

test('enrichGridCell: 返回副本、不改原对象', () => {
  const cell = { position: 'A-1' };
  const enriched = enrichGridCell(cell);
  assert.notEqual(enriched, cell);
  assert.equal('_cellStyle' in cell, false);
});

test('enrichGridCell: 类型灯 —— 饲养中(3)不点灯，空笼位(2)亮对应色', () => {
  assert.equal(enrichGridCell({ animalCageType: 3 })._cageTypeDotColor, '');
  const c2 = enrichGridCell({ animalCageType: 2 });
  assert.equal(c2._cageTypeDotColor, CAGE_TYPE_DOT_COLOR[2]);
  assert.equal(c2._cageTypeAbbr, CAGE_TYPE_ABBR[2]);
});

test('enrichGridCell: PI 简称按 4 字截断', () => {
  assert.equal(enrichGridCell({ projectPiName: '张三丰五号' })._piShort, '张三丰五…');
  assert.equal(enrichGridCell({ projectPiName: '张三' })._piShort, '张三');
});

// ---------------------------------------------------------------- buildGrid
test('buildGrid: 空入参生成 8×10 空格位', () => {
  const grid = buildGrid([]);
  assert.equal(grid.length, 80);
  assert.ok(grid.every((c) => c.empty === true));
  // 位号统一用后端口径 x-y（真实格子与补位格子同一套），显示时由 _displayPosition 反转
  assert.equal(grid[0].position, '1-1');
  assert.equal(grid[0]._displayPosition, 'A-10');
});

test('buildGrid: 一律补满 8x10（后端只回 1 格也补满），落位与口径不变', () => {
  const grid = buildGrid([{ position: 'A-1' }]);
  assert.equal(grid.length, 80, '补满 80 格');
  assert.ok(grid[0]._cellStyle);
  assert.equal(grid[0]._displayPosition, 'A-10', '第一格仍是 A-1 那格');
  assert.equal(grid[1].empty, true, '补出来的位置是空位');
  assert.ok(String(grid[1]._cellStyle).indexOf('#f1f5f9') >= 0, '补位用空位底色');
});

test('buildGrid: 按 (x,y) 落位（后端返回顺序不影响布局）', () => {
  const grid = buildGrid([
    { x: 2, y: 1, position: '2-1', empty: false, id: 'C2' },
    { x: 1, y: 1, position: '1-1', empty: false, id: 'C1' },
  ]);
  assert.equal(grid.length, 80);
  assert.equal(grid[0].id, 'C1', '第 1 格是 (1,1)');
  assert.equal(grid[1].id, 'C2', '第 2 格是 (2,1)');
});

// ---------------------------------------------------------------- 已被订购的「订」标记
// 三档颜色/文案必须与 H5 cagePickerLogic.mergeOrderReservationMarks 逐字一致：
// 笼架页、订购抽屉、卡牌打印都靠这份映射，漂了就是同一格在三处显示三种说法。
test('buildReserveMarks: 三档颜色与文案', () => {
  const m = buildReserveMarks([
    { animalCageId: '1', orderId: 'o1' },
    { animalCageId: '2', cartId: 'c1' },
    { animalCageId: '3', reserverName: '张三' },
    { animalCageId: '4' },          // 只是被锁住，没有 orderId/cartId
    { animalCageId: null },         // 脏数据：没有笼位 id 不进表
  ]);
  assert.equal(m['1'].color, '#8b5cf6');
  assert.equal(m['1'].label, '已下单待审批');
  assert.equal(m['2'].color, '#0ea5e9');
  assert.equal(m['2'].label, '已在购物车');
  assert.equal(m['3'].color, '#f59e0b');
  assert.equal(m['3'].label, '已被张三预订');
  assert.equal(m['4'].label, '已被他人预订', '没带姓名时兜底「他人」');
  assert.equal(Object.keys(m).length, 4);
});

test('applyReserveMarks: 命中的打标记，未命中的清成 null（不留上一次的残影）', () => {
  const grid = [{ id: '1', _opMark: { color: '#000000' } }, { id: '9' }];
  applyReserveMarks(grid, buildReserveMarks([{ animalCageId: '1', orderId: 'o1' }]));
  assert.equal(grid[0]._opMark.color, '#8b5cf6');
  assert.equal(grid[1]._opMark, null);
});
