'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { groupShelvesByCampus, extractParentRoomKey } = require('../miniprogram/package-door/utils/cageTreeGrouping.js');

test('extractParentRoomKey：201A → 201，210A → 210', () => {
  assert.equal(extractParentRoomKey('201A'), '201');
  assert.equal(extractParentRoomKey('210A'), '210');
});

test('extractParentRoomKey：非数字开头原样返回，空值兜底「其他」', () => {
  assert.equal(extractParentRoomKey('动物房'), '动物房');
  assert.equal(extractParentRoomKey(''), '其他');
  assert.equal(extractParentRoomKey(null), '其他');
});

test('四级分组：校区 → 房间（数字前缀折叠）→ 笼架组（roomName 原名）→ 笼架', () => {
  const shelves = [
    { shelveId: '1', shelveName: 'A1', campusName: '南校区', roomName: '201A' },
    { shelveId: '2', shelveName: 'A2', campusName: '南校区', roomName: '201B' },
    { shelveId: '3', shelveName: 'B1', campusName: '北校区', roomName: '301A' },
  ];
  const out = groupShelvesByCampus(shelves);
  assert.equal(out.length, 2);
  assert.equal(out[0].campusName, '南校区');
  assert.equal(out[0].rooms.length, 1, '201A 与 201B 折叠成同一个房间 201');
  assert.equal(out[0].rooms[0].roomName, '201');
  assert.equal(out[0].rooms[0].shelfGroups.length, 2, '笼架组按 roomName 原名分两组');
  assert.equal(out[0].rooms[0].shelfGroups[0].name, '201A');
  assert.equal(out[0].rooms[0].shelfGroups[0].shelves.length, 1);
  assert.equal(out[1].campusName, '北校区');
});

test('缺 campusName / roomName 落「其他」，不抛', () => {
  const out = groupShelvesByCampus([{ shelveId: '9', shelveName: 'X' }]);
  assert.equal(out[0].campusName, '其他');
  assert.equal(out[0].rooms[0].roomName, '其他');
  assert.equal(out[0].rooms[0].shelfGroups[0].name, '其他');
});

test('空数组返回空；undefined 返回空', () => {
  assert.deepEqual(groupShelvesByCampus([]), []);
  assert.deepEqual(groupShelvesByCampus(undefined), []);
});

test('返回值不含内部索引 roomMap / groupMap', () => {
  const out = groupShelvesByCampus([{ shelveId: '1', shelveName: 'A1', campusName: '南校区', roomName: '201A' }]);
  assert.deepEqual(Object.keys(out[0]), ['campusName', 'rooms']);
  assert.deepEqual(Object.keys(out[0].rooms[0]), ['roomName', 'shelfGroups', 'hasHighlight']);
});

test('highlight 冒泡到所属 room 与 shelfGroup', () => {
  const out = groupShelvesByCampus([
    { shelveId: '1', shelveName: 'A1', campusName: '南校区', roomName: '201A', highlight: true },
    { shelveId: '2', shelveName: 'B1', campusName: '南校区', roomName: '201B' },
  ]);
  const room = out[0].rooms[0];
  assert.equal(room.hasHighlight, true);
  const g1 = room.shelfGroups.find((g) => g.name === '201A');
  const g2 = room.shelfGroups.find((g) => g.name === '201B');
  assert.equal(g1.hasHighlight, true, '带 highlight 的架所属组为 true');
  assert.equal(g2.hasHighlight, false, '不带 highlight 的组为 false');
});
