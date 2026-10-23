'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.wx = {
  getStorageSync: () => '',
  showToast: () => {},
  showLoading: () => {},
  hideLoading: () => {},
  stopPullDownRefresh: () => {},
  setStorageSync: () => {},
};

let pageConfig = null;
global.Page = (config) => { pageConfig = config; };

const api = require('../miniprogram/package-door/utils/doorControlApi.js');
require('../miniprogram/package-door/pages/doorControl/index.js');

function makePage() {
  const page = Object.assign({}, pageConfig, { data: JSON.parse(JSON.stringify(pageConfig.data)) });
  page.setData = function setData(patch) { Object.assign(this.data, patch); };
  return page;
}

function buildPage(rows, statusByCode, catById) {
  const page = makePage();
  page._rows = rows;
  page._statusByCode = statusByCode || {};
  page._catById = catById || {};
  page.buildItems();
  return page;
}

test('文件夹归组：按后台分类树的一级文件夹分组，多级自动上溯', () => {
  const catById = {
    10: { id: 10, parentId: null, name: 'B1F', sortOrder: 1 },
    11: { id: 11, parentId: 10, name: 'B1F-E12', sortOrder: 2 },
    12: { id: 12, parentId: null, name: '2F', sortOrder: 3 },
    13: { id: 13, parentId: 12, name: '2F饲养员', sortOrder: 4 },
    14: { id: 14, parentId: 13, name: '2F-A区', sortOrder: 5 },
  };
  const page = buildPage([
    { channelName: '换鞋室(120)-137-MK01', channelCode: 'a', remarkCategoryId: 11 },
    { channelName: '换鞋室(221)-2F-RD1-MK01', channelCode: 'b', remarkCategoryId: 14 },
    { channelName: '消防楼梯LT2-137-MK01', channelCode: 'c' },
  ], null, catById);

  assert.deepEqual(page.data.groups.map((g) => g.floor), ['B1F', '2F', '未分类']);
  assert.deepEqual(page.data.groups.map((g) => g.items.map((it) => it.code)), [['a'], ['b'], ['c']]);
  assert.deepEqual(page.data.statusCounts, {
    all: 3, online: 0, OFFLINE: 0, unknown: 3, STAY_OPEN: 0, STAY_CLOSE: 0, NORMAL: 0,
  });
});

test('状态映射与计数：常开/常闭/普通/离线/未知各归各位', () => {
  const page = buildPage(
    [
      { channelName: 'A-2F', channelCode: 'a' },
      { channelName: 'B-2F', channelCode: 'b' },
      { channelName: 'C-2F', channelCode: 'c' },
      { channelName: 'D-2F', channelCode: 'd' },
      { channelName: 'E-2F', channelCode: 'e' },
    ],
    {
      a: { status: 0, workMode: 2, onlineStatus: 'ON', at: Date.now() },
      b: { status: 0, workMode: 1, onlineStatus: 'ON', at: Date.now() },
      c: { status: 0, workMode: 0, onlineStatus: 'ON', at: Date.now() },
      d: { status: 0, workMode: 0, onlineStatus: 'OFF', at: Date.now() },
      e: { unknown: true, at: 0 },
    }
  );

  assert.deepEqual(page.data.statusCounts, {
    all: 5, online: 3, OFFLINE: 1, unknown: 1, STAY_OPEN: 1, STAY_CLOSE: 1, NORMAL: 1,
  });

  const byCode = {};
  page._items.forEach((it) => { byCode[it.code] = it; });
  assert.equal(byCode.a.statusText, '常开');
  assert.equal(byCode.b.statusText, '常闭');
  assert.equal(byCode.c.statusText, '普通');
  assert.equal(byCode.d.statusText, '离线');
  assert.equal(byCode.e.statusText, '状态未知');
});

test('状态筛选：离线只留离线门，常开只留常开门', () => {
  const page = buildPage(
    [
      { channelName: 'A-2F', channelCode: 'a' },
      { channelName: 'B-2F', channelCode: 'b' },
    ],
    {
      a: { status: 0, workMode: 2, onlineStatus: 'ON', at: Date.now() },
      b: { status: 0, workMode: 0, onlineStatus: 'OFF', at: Date.now() },
    }
  );

  page.data.activeStatusFilter = 'OFFLINE';
  page.applyFilter();
  assert.deepEqual(page.data.groups.map((g) => g.floor), ['未分类']);
  assert.deepEqual(page.data.groups[0].items.map((it) => it.code), ['b']);

  page.data.activeStatusFilter = 'STAY_OPEN';
  page.applyFilter();
  assert.deepEqual(page.data.groups[0].items.map((it) => it.code), ['a']);
});

test('批量状态：没回包的通道标未知，下一轮刷新能补上', async () => {
  const original = api.queryStatus;
  let round = 0;
  api.queryStatus = async () => {
    round += 1;
    if (round === 1) {
      return { rows: [{ channelCode: 'x', status: 0, workMode: 2, onlineStatus: 'ON' }] };
    }
    return { rows: [
      { channelCode: 'x', status: 0, workMode: 2, onlineStatus: 'ON' },
      { channelCode: 'y', status: 0, workMode: 0, onlineStatus: 'ON' },
    ] };
  };

  try {
    const page = buildPage([
      { channelName: 'A-2F', channelCode: 'x' },
      { channelName: 'B-2F', channelCode: 'y' },
    ]);
    await page.refreshStatuses({ force: false });

    const item = (code) => page._items.find((it) => it.code === code);
    assert.equal(item('x').statusText, '常开');
    assert.equal(item('y').statusText, '状态未知');

    await page.refreshStatuses({ force: true, silent: true });
    assert.equal(item('y').statusText, '普通');
    assert.equal(page._statusByCode.y.unknown, undefined);
  } finally {
    api.queryStatus = original;
  }
});

test('操作后：先乐观置位，再回查直到设备确认；开门只回查一次', async () => {
  const page = buildPage(
    [{ channelName: '门-2F', channelCode: 'z' }],
    { z: { status: 0, workMode: 0, onlineStatus: 'ON', at: Date.now() } }
  );

  page.applyOptimistic('z', 'STAY_OPEN');
  assert.equal(page._items[0].statusText, '常开', '乐观更新没生效');

  let polls = 0;
  page.fetchOneStatus = async () => {
    polls += 1;
    return { status: 0, workMode: polls >= 3 ? 2 : 0, onlineStatus: 'ON', at: Date.now() };
  };
  await page.refreshOneWithRetry('z', 'STAY_OPEN');
  assert.equal(polls, 3, `应在第 3 次回查确认后停止，实际 ${polls} 次`);
  assert.equal(page._items[0].statusText, '常开');

  const instant = buildPage(
    [{ channelName: '门-2F', channelCode: 'w' }],
    { w: { status: 0, workMode: 0, onlineStatus: 'ON', at: Date.now() } }
  );
  let instantPolls = 0;
  instant.fetchOneStatus = async () => {
    instantPolls += 1;
    return { status: 1, workMode: 0, onlineStatus: 'ON', at: Date.now() };
  };
  instant.applyOptimistic('w', 'OPEN');
  assert.equal(instant._items[0].statusText, '已开门');
  await instant.refreshOneWithRetry('w', 'OPEN');
  assert.equal(instantPolls, 1, `开门只该回查一次，实际 ${instantPolls} 次`);

  if (instant._flashTimer) clearTimeout(instant._flashTimer);
});
