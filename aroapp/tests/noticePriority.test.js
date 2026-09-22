'use strict';
/**
 * 回归：门户公告优先级在移动端的体现（2026-09-22 加）。
 *
 * 后端 /api/student/mobile/alerts 把门户「通知公告」的 extension_json.priority 原样放在
 * `item.priority` 上，并要求「重要」置顶。前端如果只按时间倒序，重要公告会被新公告压下去；
 * 角标也会一律显示「公告」。这里锁住三件事：排序、角标文案、角标配色。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const alerts = require('../miniprogram/utils/studentAlertHelpers.js');

const notice = (id, priority, publishAt) => ({
  id,
  kind: 'general_notice',
  title: `公告${id}`,
  contentHtml: '',
  priority,
  publishAt,
  section: 'GENERAL',
});

test('重要公告置顶，其余按发布时间倒序', () => {
  const list = [
    notice(1, 'routine', '2026-09-20T10:00:00'),
    notice(2, 'important', '2026-09-01T10:00:00'),
    notice(3, 'routine', '2026-09-21T10:00:00'),
  ];
  assert.deepEqual(alerts.sortAlertsForDisplay(list).map((i) => i.id), [2, 3, 1]);
});

test('通知排在常规之前，但仍在重要之后', () => {
  const list = [
    notice(1, 'routine', '2026-09-21T10:00:00'),
    notice(2, 'notice', '2026-09-02T10:00:00'),
    notice(3, 'important', '2026-09-01T10:00:00'),
  ];
  assert.deepEqual(alerts.sortAlertsForDisplay(list).map((i) => i.id), [3, 2, 1]);
});

test('排序不改原数组、缺 priority 的当常规', () => {
  const list = [notice(1, 'routine', '2026-09-21T10:00:00'), { id: 2, kind: 'general_notice', title: 'x', publishAt: '2026-09-01T10:00:00' }];
  assert.deepEqual(alerts.sortAlertsForDisplay(list).map((i) => i.id), [1, 2]);
  assert.equal(list[0].id, 1);
});

test('豁免/违规的既有档位没被公告优先级顶掉', () => {
  const list = [
    notice(1, 'important', '2026-09-01T10:00:00'),
    { id: 2, kind: 'exempt', title: '豁免', contentHtml: '', publishAt: '2026-09-02T10:00:00' },
    { id: 3, kind: 'violation', title: '违规', contentHtml: '', publishAt: '2026-09-03T10:00:00' },
  ];
  // 首页公告区里三者在同一段，重要公告在最前，豁免次之，违规最后（与改造前一致）
  assert.deepEqual(alerts.sortAlertsForDisplay(list).map((i) => i.id), [1, 2, 3]);
});

test('角标文案与配色按优先级走', () => {
  assert.equal(alerts.kindLabel('general_notice', 'important'), '重要');
  assert.equal(alerts.kindLabel('general_notice', 'notice'), '通知');
  assert.equal(alerts.kindLabel('general_notice', 'routine'), '公告');
  assert.equal(alerts.kindLabel('general_notice'), '公告');
  // 别的类型不受影响
  assert.equal(alerts.kindLabel('violation'), '违规提醒');

  assert.equal(alerts.kindColors('general_notice', 'important').color, '#dc2626');
  assert.equal(alerts.kindColors('general_notice', 'notice').color, '#16a34a');
  assert.equal(alerts.kindColors('general_notice', 'routine').color, '#2563eb');
  assert.equal(alerts.kindColors('violation').color, '#dc2626');
});

test('列表项装饰把优先级带进角标', () => {
  const decorated = alerts.decorateBulletinListItem(notice(9, 'important', '2026-09-01T10:00:00'));
  assert.equal(decorated.badgeLabel, '重要');
  assert.equal(decorated.badgeColor, '#dc2626');
});

test('extensionPriority 只认对象/JSON 串里的 priority', () => {
  assert.equal(alerts.extensionPriority('{"priority":"important"}'), 'important');
  assert.equal(alerts.extensionPriority({ priority: 'notice' }), 'notice');
  assert.equal(alerts.extensionPriority('{"pinned":true}'), null);
  assert.equal(alerts.extensionPriority('not json'), null);
  assert.equal(alerts.extensionPriority(null), null);
});
