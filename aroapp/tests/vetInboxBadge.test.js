'use strict';
/**
 * 回归：兽医收件箱未读角标（2026-09-18 加）。
 *
 * 后端只对拿得到 cage.vet.inbox 的账号写非零值，其余恒 0 —— 三处入口（首页主入口「笼架」、
 * 学生底栏「笼架」、笼架页顶栏那枚兽医图标）都用这一个函数取文本，所以「0 不显示 / 99+ 封顶」
 * 只在这里判一次。判定错了的表现是：所有入口都挂着一颗红色的 0。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// springAuth 在模块加载期会读 wx 存储，测试环境补个空壳
global.wx = global.wx || {
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
};

const { vetInboxBadgeText, EMPTY_BADGE_COUNTS } = require('../miniprogram/utils/pendingBadgeCounts.js');

test('vetInboxBadgeText: 0 与缺省都不出角标', () => {
  assert.equal(vetInboxBadgeText(null), '');
  assert.equal(vetInboxBadgeText(EMPTY_BADGE_COUNTS), '');
  assert.equal(vetInboxBadgeText({ vetInbox: 0 }), '');
});

test('vetInboxBadgeText: 正常给数字，超过 99 封顶', () => {
  assert.equal(vetInboxBadgeText({ vetInbox: 3 }), '3');
  assert.equal(vetInboxBadgeText({ vetInbox: 99 }), '99');
  assert.equal(vetInboxBadgeText({ vetInbox: 150 }), '99+');
});
