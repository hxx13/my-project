'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sexOfSpecLabel,
  isSexMismatch,
  totalCapacity,
  allocateInOrder,
  groupShelvesByRoom,
  submittableLines,
} = require('../miniprogram/package-feature/utils/animalOrderCagePicker.js');

// ---------------------------------------------------------------- 性别识别
test('sexOfSpecLabel: 认得出雌/雄（中英文与符号）', () => {
  assert.equal(sexOfSpecLabel('雌性 BALB/c'), 'female');
  assert.equal(sexOfSpecLabel('母鼠'), 'female');
  assert.equal(sexOfSpecLabel('Female C57'), 'female');
  assert.equal(sexOfSpecLabel('雄性 BALB/c'), 'male');
  assert.equal(sexOfSpecLabel('公鼠'), 'male');
  assert.equal(sexOfSpecLabel('male'), 'male');
});

test('sexOfSpecLabel: 认不出返回空串（不猜）', () => {
  assert.equal(sexOfSpecLabel('SPF级'), '');
  assert.equal(sexOfSpecLabel(''), '');
  assert.equal(sexOfSpecLabel(null), '');
  assert.equal(sexOfSpecLabel(undefined), '');
});

test('isSexMismatch: 只有双方都认得出且不同才算不符', () => {
  assert.equal(isSexMismatch('雌', 'female'), false, '同为雌');
  assert.equal(isSexMismatch('male', '雌'), true, '雄 vs 雌 → 不符');
  assert.equal(isSexMismatch('', 'female'), false, '笼位没性别 → 不拦');
  assert.equal(isSexMismatch('雄', ''), false, '规格没性别 → 不拦');
  assert.equal(isSexMismatch(null, null), false);
  assert.equal(isSexMismatch('SPF', 'female'), false, '笼位性别认不出 → 不拦');
});

// ---------------------------------------------------------------- 容量与分配
test('totalCapacity: 笼位数 × 单笼上限', () => {
  assert.equal(totalCapacity(3, 5), 15);
  assert.equal(totalCapacity(0, 5), 0);
  assert.equal(totalCapacity(2, 1), 2);
  assert.equal(totalCapacity(2, 0), 2, '上限非法时按 1 兜底');
});

test('allocateInOrder: 按顺序铺满，最后一笼拿余数', () => {
  const flat = (total, ids, cap, pinned) => Object.values(allocateInOrder(total, ids, cap, pinned).alloc);
  assert.deepEqual(flat(8, ['a', 'b'], 5), [5, 3]);
  assert.deepEqual(flat(5, ['a', 'b'], 5), [5, 0]);
  assert.deepEqual(flat(1, ['a', 'b', 'c'], 5), [1, 0, 0]);
  assert.deepEqual(flat(15, ['a', 'b', 'c'], 5), [5, 5, 5]);
  assert.deepEqual(flat(0, ['a', 'b'], 5), [0, 0], '数量 0：每笼 0');
});

test('allocateInOrder: 没选笼位时数量全落 overflow；容量不足也走 overflow 不抛错', () => {
  assert.deepEqual(allocateInOrder(0, [], 5), { alloc: {}, overflow: 0 });
  assert.deepEqual(allocateInOrder(3, [], 5), { alloc: {}, overflow: 3 });
  const over = allocateInOrder(11, ['a', 'b'], 5);
  assert.deepEqual(over.alloc, { a: 5, b: 5 }, '能放的都放满');
  assert.equal(over.overflow, 1, '多余的交给 UI 拦');
});

// 手改过的笼位当起点，其余按顺序吸收差额 —— 与 web cageAllocation.allocateInOrder 同一份算法，
// 两端飘了就会出现「H5 微调完 5/5/2，小程序同一份选择分出来是别的数」
test('allocateInOrder: 手动钉住的数量作为起点，容量够就一定让 Σ===总数', () => {
  const r = allocateInOrder(12, ['a', 'b', 'c'], 5, { c: 5 });
  assert.deepEqual(r, { alloc: { a: 5, b: 2, c: 5 }, overflow: 0 });
  const zeroed = allocateInOrder(5, ['a', 'b'], 5, { a: 0 });
  assert.deepEqual(zeroed.alloc, { a: 0, b: 5 }, '钉成 0 就真的不给它补');
  const shrunk = allocateInOrder(3, ['a', 'b', 'c'], 5, { a: 5 });
  assert.deepEqual(shrunk.alloc, { a: 3, b: 0, c: 0 }, '总数缩小时钉子跟着缩，不超总数');
  const capped = allocateInOrder(12, ['a', 'b'], 5, { a: 5 });
  assert.deepEqual(capped, { alloc: { a: 5, b: 5 }, overflow: 2 });
});

// ---------------------------------------------------------------- 房间分组
test('groupShelvesByRoom: 按房间归并且保持后端顺序', () => {
  const shelves = [
    { shelveId: 'S1', shelveName: '一号架', roomName: '201', campusName: '南校区' },
    { shelveId: 'S2', shelveName: '二号架', roomName: '201', campusName: '南校区' },
    { shelveId: 'S3', shelveName: '三号架', roomName: '202', campusName: '南校区' },
  ];
  const rooms = groupShelvesByRoom(shelves);
  assert.deepEqual(rooms.map((r) => r.roomName), ['201', '202']);
  assert.equal(rooms[0].shelves.length, 2);
  assert.equal(rooms[1].shelves.length, 1);
  assert.equal(rooms[0].key, '南校区/201', '同房间号不同校区不会混');
});

test('groupShelvesByRoom: 缺房间名落「其他」；空/非数组返回空', () => {
  const rooms = groupShelvesByRoom([{ shelveId: 'S9' }]);
  assert.equal(rooms[0].roomName, '其他');
  assert.deepEqual(groupShelvesByRoom(null), []);
  assert.deepEqual(groupShelvesByRoom([]), []);
});

// 提交订单带哪些行 —— 与 web readyLines 同口径。曾经只取 READY，PI 自己的草稿行被漏掉，
// 同一份购物车在小程序下单会比 web 少几行，两张订单对不上。
test('submittableLines: READY 行 + PI 本人加购的行，其余不算', () => {
  const cart = [
    { id: 1, packageStatus: 'READY', addedBy: 'u2' },    // 实验员提交给 PI 的
    { id: 2, packageStatus: 'DRAFT', addedBy: 'pi1' },   // PI 本人加的草稿
    { id: 3, packageStatus: 'DRAFT', addedBy: 'u2' },    // 别人的草稿
    null,
  ];
  assert.deepEqual(submittableLines(cart, true, 'pi1').map((l) => l.id), [1, 2]);
  assert.deepEqual(submittableLines(cart, false, 'pi1').map((l) => l.id), [1], '非 PI 只提交已 READY 的行');
  assert.deepEqual(submittableLines(null, true, 'pi1'), []);
  assert.deepEqual(submittableLines(cart, true, '').map((l) => l.id), [1], '拿不到账号时别把空串当「本人」');
});
