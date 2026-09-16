/**
 * 回归：小程序房间页权限查询（与 H5 roomPermissionMatch.test.ts 同一套判据）。
 * 旧实现把「门禁授权房间」和 wechat-overview 按**裸名字子串**求交集，后果：
 *   ① 本地房档对不上名字的授权房（浦西 503A vs 本地 5F-503）整个消失；
 *   ② 本地没有房档的授权房（浦西 604A）也消失；
 *   ③ 浦东 301A 的权限会蹭到浦西同名的 3F-301A。
 */
const test = require('node:test');
const assert = require('node:assert');

global.wx = new Proxy({}, { get: () => () => '' });
const { buildMyRooms } = require('../miniprogram/utils/twinScanAnalyze.js');

// 真实回包形状：overview 是本地房档（浦西带楼层前缀），授权房用官方短码
const overview = [
  { roomId: 56, roomName: '4F-401', campus: '浦东', totalCapacity: 4, capacityBindRoomId: '1951178410424299521' },
  { roomId: 45, roomName: '3F-301', campus: '浦东', totalCapacity: 3, capacityBindRoomId: '1951183182682419201' },
  { roomId: 8, roomName: '5F-503', campus: '浦西', totalCapacity: 2, capacityBindRoomId: null },
  { roomId: 41, roomName: '3F-301A', campus: '浦西', totalCapacity: 2, capacityBindRoomId: null },
];

const dto = (allowedRooms) => ({ success: true, currentState: 'OUTSIDE', allowedRooms, pendingRooms: [] });

test('本地没有房档的授权房也要出卡（浦西 604A）', () => {
  const rooms = buildMyRooms(overview, dto([
    { displayName: '6A - 604A', officialRoomName: '604A', officialRoomId: '9001', campusTag: '浦西' },
  ]));
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].roomName, '604A');
  assert.equal(String(rooms[0].roomId), '9001');
});

test('浦西短码经「尾段+后缀」桥对上本地房档（503A ↔ 5F-503）', () => {
  const rooms = buildMyRooms(overview, dto([
    { displayName: '浦西 5F - 503A', officialRoomName: '503A', officialRoomId: '9002', campusTag: '浦西' },
  ]));
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].roomName, '5F-503');
  assert.equal(String(rooms[0].roomId), '9002');
});

test('授权房带官方 id，延迟链路不再靠名字反查', () => {
  const rooms = buildMyRooms(overview, dto([
    { displayName: '浦东 4F - 401', officialRoomName: '401', officialRoomId: '1951178410424299521', campusTag: '浦东' },
  ]));
  assert.equal(String(rooms[0].roomId), '1951178410424299521');
});

test('浦东 301A 不会蹭到浦西同名的 3F-301A', () => {
  const rooms = buildMyRooms(overview, dto([
    { displayName: '浦东 3F - 301A', officialRoomName: '301A', officialRoomId: '9003', campusTag: '浦东' },
  ]));
  assert.equal(rooms[0].roomName, '3F-301');
});

test('analyze 失败时不出卡（不能把「查不到」当成「无权限」）', () => {
  assert.equal(buildMyRooms(overview, { success: false }).length, 0);
  assert.equal(buildMyRooms(overview, null).length, 0);
});
