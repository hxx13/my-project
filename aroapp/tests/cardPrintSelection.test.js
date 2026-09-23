'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createSelection } = require('../miniprogram/package-door/utils/cardPrintSelection.js');

const cell = (id, x, y) => ({ id, x, y });

test('初始为空：计数 0、ids 空、list 空', () => {
  const s = createSelection();
  assert.equal(s.count(), 0);
  assert.deepEqual(s.ids(), []);
  assert.deepEqual(s.list(), []);
});

test('toggle 选中再点取消', () => {
  const s = createSelection();
  assert.equal(s.toggle('S1', cell('100', 0, 0)), true);
  assert.equal(s.isSelected('S1', '100'), true);
  assert.equal(s.count(), 1);
  assert.equal(s.toggle('S1', cell('100', 0, 0)), true);
  assert.equal(s.isSelected('S1', '100'), false);
  assert.equal(s.count(), 0);
});

test('空位（无 id）点了不生效', () => {
  const s = createSelection();
  assert.equal(s.toggle('S1', cell('', 0, 0)), false);
  assert.equal(s.toggle('S1', { x: 1, y: 1 }), false);
  assert.equal(s.toggle('S1', null), false);
  assert.equal(s.count(), 0);
});

test('计数分两个口径：跨架合计 vs 本架', () => {
  const s = createSelection();
  s.toggle('S1', cell('1', 0, 0));
  s.toggle('S1', cell('2', 0, 1));
  s.toggle('S2', cell('3', 0, 0));
  assert.equal(s.count(), 3);
  assert.equal(s.countOnShelf('S1'), 2);
  assert.equal(s.countOnShelf('S2'), 1);
  assert.equal(s.countOnShelf('S9'), 0);
});

test('本架全选跳过空位', () => {
  const s = createSelection();
  s.selectAllOnShelf('S1', [cell('1', 0, 0), cell('', 0, 1), { x: 0, y: 2 }, cell('2', 0, 3)]);
  assert.equal(s.countOnShelf('S1'), 2);
  assert.equal(s.isSelected('S1', '1'), true);
  assert.equal(s.isSelected('S1', '2'), true);
});

test('clearShelf 只清本架，不动别的架', () => {
  const s = createSelection();
  s.toggle('S1', cell('1', 0, 0));
  s.toggle('S2', cell('2', 0, 0));
  s.clearShelf('S1');
  assert.equal(s.countOnShelf('S1'), 0);
  assert.equal(s.countOnShelf('S2'), 1);
  assert.equal(s.count(), 1);
});

test('clearAll 清空全部', () => {
  const s = createSelection();
  s.toggle('S1', cell('1', 0, 0));
  s.toggle('S2', cell('2', 0, 0));
  s.clearAll();
  assert.equal(s.count(), 0);
  assert.deepEqual(s.list(), []);
});

test('ids 按加入顺序，供请求体直接使用', () => {
  const s = createSelection();
  s.toggle('S1', cell('2', 0, 0));
  s.toggle('S1', cell('1', 0, 1));
  assert.deepEqual(s.ids(), ['2', '1']);
});

test('list 按架分组、保留加入顺序，供已选清单展示', () => {
  const s = createSelection();
  s.toggle('S1', cell('1', 0, 0));
  s.toggle('S2', cell('2', 0, 0));
  s.toggle('S1', cell('3', 1, 0));
  assert.deepEqual(s.list(), [
    { shelveId: 'S1', cells: [cell('1', 0, 0), cell('3', 1, 0)] },
    { shelveId: 'S2', cells: [cell('2', 0, 0)] },
  ]);
});

test('signature 与加入顺序无关：同一组格子签名相同', () => {
  const a = createSelection();
  a.toggle('S1', cell('1', 0, 0));
  a.toggle('S1', cell('2', 0, 1));
  const b = createSelection();
  b.toggle('S1', cell('2', 0, 1));
  b.toggle('S1', cell('1', 0, 0));
  assert.equal(a.signature(), b.signature());
});

test('signature 随选择变化：可用于判断 archiveId 是否需要重新生成', () => {
  const s = createSelection();
  s.toggle('S1', cell('1', 0, 0));
  const before = s.signature();
  s.toggle('S1', cell('2', 0, 1));
  assert.notEqual(s.signature(), before);
});

test('同 id 不同架互不影响', () => {
  const s = createSelection();
  s.toggle('S1', cell('1', 0, 0));
  s.toggle('S2', cell('1', 0, 0));
  assert.equal(s.count(), 2);
  s.clearShelf('S1');
  assert.equal(s.isSelected('S2', '1'), true);
});

test('本架全选全是空位：不留幽灵分组，list 为空', () => {
  const s = createSelection();
  s.selectAllOnShelf('S1', [{ x: 0, y: 0 }, { x: 0, y: 1 }]);
  assert.equal(s.count(), 0);
  assert.equal(s.countOnShelf('S1'), 0);
  assert.deepEqual(s.list(), []);
});

test('在已有选择上再全选：增量合并，不丢原有', () => {
  const s = createSelection();
  s.toggle('S1', cell('1', 0, 0));
  s.toggle('S2', cell('9', 0, 0));
  s.selectAllOnShelf('S1', [cell('1', 0, 0), cell('2', 0, 1), cell('3', 0, 2)]);
  assert.equal(s.countOnShelf('S1'), 3);
  assert.equal(s.isSelected('S1', '1'), true);
  assert.equal(s.isSelected('S2', '9'), true, '别的架不受影响');
  assert.equal(s.count(), 4);
});
