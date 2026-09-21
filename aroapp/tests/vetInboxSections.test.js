'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSections, buildBasicRows, normalizeMessage, statusColor,
  groupKeyOf, flattenStatusPhotos, UNREAD_COLOR,
  matchesFilter, matchesKeyword, filterCounts,
} = require('../miniprogram/package-feature/utils/vetInboxSections.js');

function msg(over) {
  return Object.assign({
    id: 1,
    animalCageId: '9001',
    statusCode: 'HEALTH_ABNORMAL',
    statusLabel: '健康异常',
    firedAt: '2026-09-19T10:20:30',
    read: false,
    campusName: 'B栋',
    floorName: '3F',
    roomName: '301房间',
    shelveName: '架A',
    positionLabel: '1-2',
    projectPiName: '张课题组',
  }, over);
}

// ------------------------------------------------- 两段：未读浮上、已读沉下去
test('buildSections: 未读进「待查看」、已读进「已查看」，空段整段不出现', () => {
  const secs = buildSections([msg({ id: 1 }), msg({ id: 2, read: true })], null);
  assert.equal(secs.length, 2);
  assert.equal(secs[0].key, 'unread');
  assert.equal(secs[0].count, 1);
  assert.equal(secs[1].key, 'read');
  assert.equal(secs[1].count, 1);

  const onlyRead = buildSections([msg({ id: 2, read: true })], null);
  assert.deepEqual(onlyRead.map((s) => s.key), ['read'], '全是已读时不该留一个空的待查看段');
});

// 用户 2026-09-19 口径：未处理的自然打开，处理过的自然折叠
test('buildSections: 待查看默认展开、已查看默认折叠；组一律默认展开', () => {
  const secs = buildSections([msg({ id: 1 }), msg({ id: 2, read: true })], null);
  assert.equal(secs[0].open, true, '待查看段默认展开');
  assert.equal(secs[1].open, false, '已查看段默认折叠');
  assert.equal(secs[0].groups[0].open, true, '待查看的组默认展开');
  assert.equal(
    secs[1].groups[0].open,
    true,
    '组不跟着段一起收：展开已查看却看到一片空组头是死胡同',
  );
});

test('buildSections: 折叠状态按路径记住，刷新数据不丢', () => {
  const open = { 'sec:unread': false, 'grp:unread:B栋|3F|301房间|架A': false };
  const isOpen = (p, def) => (p in open ? open[p] : def);
  const secs = buildSections([msg({ id: 1 })], isOpen);
  assert.equal(secs[0].open, false);
  assert.equal(secs[0].groups[0].open, false);
});

// ------------------------------------------------- 组：按笼架分，同架合一组
test('buildSections: 同笼架的消息合成一组，按首次出现顺序排列', () => {
  const secs = buildSections([
    msg({ id: 1, shelveName: '架A', positionLabel: '1-2' }),
    msg({ id: 2, shelveName: '架B', positionLabel: '1-1' }),
    msg({ id: 3, shelveName: '架A', positionLabel: '2-4' }),
  ], null);
  const gs = secs[0].groups;
  assert.deepEqual(gs.map((g) => g.name), ['架A', '架B']);
  assert.equal(gs[0].count, 2);
  assert.equal(gs[1].count, 1);
  assert.equal(gs[0].loc, 'B栋 · 3F · 301房间');
});

test('groupKeyOf: 缺名也拼成稳定键，同名不同房间不合并', () => {
  assert.equal(groupKeyOf(msg({})), 'B栋|3F|301房间|架A');
  assert.equal(groupKeyOf(msg({ shelveName: null, roomName: null })), 'B栋|3F||');
  assert.notEqual(
    groupKeyOf(msg({ roomName: '301房间' })),
    groupKeyOf(msg({ roomName: '302房间' })),
    '房间不同就不该进同一组',
  );
});

// ------------------------------------------------- 派生字段
test('normalizeMessage: 时间与位号兜底、行键转字符串', () => {
  const n = normalizeMessage(msg({ fireAt: null, positionLabel: null, firedAt: '2026-09-19T10:20:30' }));
  assert.equal(n.timeText, '2026-09-19 10:20');
  assert.equal(n.posText, '—');
  assert.equal(n._rid, '1');
});

test('normalizeMessage: 严重程度/瘙痒单独留着也算有状态，且不重复进健康异常那片', () => {
  const dup = normalizeMessage(msg({
    statuses: [{ code: 'HEALTH_ABNORMAL', label: '健康异常' }],
    healthSeverityLabel: '中度',
  }));
  assert.deepEqual(dup.chips.map((c) => c.text), ['健康异常·中度'], '严重程度并进健康异常那片，不另起一枚');

  const orphan = normalizeMessage(msg({ statuses: [], healthSeverityLabel: '中度', healthItch: true }));
  assert.deepEqual(orphan.chips.map((c) => c.text), ['健康异常·中度', '瘙痒']);
});

test('normalizeMessage: hasAdvice 认文字也认图片', () => {
  assert.equal(normalizeMessage(msg({ adviceText: '' })).hasAdvice, false);
  assert.equal(normalizeMessage(msg({ adviceText: '  ' })).hasAdvice, false, '纯空白不算已回意见');
  assert.equal(normalizeMessage(msg({ adviceText: '换水' })).hasAdvice, true);
  assert.equal(normalizeMessage(msg({ adviceText: '', adviceImages: ['u1'] })).hasAdvice, true);
});

test('statusColor: 明细码（SF_ 前缀）归到特殊饲养那一色，未知码退中性灰', () => {
  assert.equal(statusColor('SPECIAL_FEEDING'), '#ef4444');
  assert.equal(statusColor('SF_WATER'), '#ef4444');
  assert.equal(statusColor('WHAT_EVER'), '#94a3b8');
  assert.equal(statusColor(undefined), '#94a3b8');
});

test('buildBasicRows: 空值不出现，长值标 wide 跨两列', () => {
  const rows = buildBasicRows(msg({
    cageBoxCode: '',
    aupNumber: null,
    cageTypeCode: 3,
    experimenterName: '李四',
  }));
  assert.deepEqual(rows.map((r) => r.label), ['位置', '课题组', '实验员', '笼位状态']);
  assert.equal(rows.find((r) => r.label === '笼位状态').value, '饲养中', '笼位类型复用网格标签并去掉括号');
  assert.equal(rows.find((r) => r.label === '实验员').wide, false, '短值不跨列');
  assert.equal(rows.find((r) => r.label === '位置').wide, true, '校区·楼层·房间拼起来就是长值，跨满两列');
  assert.equal(buildBasicRows(msg({ projectPiName: '一个非常非常长的课题组名称' })).find((r) => r.label === '课题组').wide, true);
});

test('flattenStatusPhotos: 按状态分桶的 JSON 拍平；坏数据不抛', () => {
  assert.deepEqual(flattenStatusPhotos('{"HEALTH_ABNORMAL":["a","b"],"SPECIAL_FEEDING":["c"]}'), ['a', 'b', 'c']);
  assert.deepEqual(flattenStatusPhotos('{坏 json'), []);
  assert.deepEqual(flattenStatusPhotos(null), []);
});

test('未读色与 Web/H5 网格描边同色', () => {
  assert.equal(UNREAD_COLOR, '#a855f7');
});

// ------------------------------------------------- 筛选轴（与已读未读相互独立）
test('matchesFilter: 按回没回意见分，与已读未读是两条轴', () => {
  const repliedButUnread = normalizeMessage(msg({ read: false, adviceText: '已换水' }));
  const readButPending = normalizeMessage(msg({ read: true, adviceText: '' }));

  assert.equal(matchesFilter(repliedButUnread, 'all'), true);
  assert.equal(matchesFilter(repliedButUnread, 'replied'), true, '没点已查看但回了意见，算已回');
  assert.equal(matchesFilter(repliedButUnread, 'pending'), false);
  assert.equal(matchesFilter(readButPending, 'pending'), true, '看完但没回，算待回');
  assert.equal(matchesFilter(readButPending, 'replied'), false);
});

test('buildSections: 筛选后再分段，只回意见的也照样归到「已查看」段', () => {
  const msgs = [
    normalizeMessage(msg({ id: 1, read: false, adviceText: '' })),
    normalizeMessage(msg({ id: 2, read: false, adviceText: '已换水' })),
    normalizeMessage(msg({ id: 3, read: true, adviceText: '已换水' })),
  ];
  const pending = buildSections(msgs, null, 'pending', '');
  assert.equal(pending.length, 1, '待回意见只剩 1 条未读 → 已查看段为空，不出现');
  assert.equal(pending[0].count, 1);

  const replied = buildSections(msgs, null, 'replied', '');
  assert.deepEqual(replied.map((s) => s.key), ['unread', 'read']);
  assert.deepEqual(replied.map((s) => s.count), [1, 1]);
});

// ------------------------------------------------- 搜索
test('matchesKeyword: 命中位号/笼架/房间/课题组/AUP/笼盒编号/状态，忽略大小写与首尾空格', () => {
  const m = msg({ aupNumber: 'AUP-2026-001', cageBoxCode: 'CB-00123' });
  assert.equal(matchesKeyword(m, '1-2'), true, '位号');
  assert.equal(matchesKeyword(m, '架A'), true, '笼架');
  assert.equal(matchesKeyword(m, '301'), true, '房间');
  assert.equal(matchesKeyword(m, 'B栋'), true, '校区');
  assert.equal(matchesKeyword(m, '张课题组'), true, '课题组');
  assert.equal(matchesKeyword(m, 'aup-2026'), true, 'AUP 编号，大小写不敏感');
  assert.equal(matchesKeyword(m, 'cb-001'), true, '笼盒编号');
  assert.equal(matchesKeyword(m, '健康异常'), true, '状态');
  assert.equal(matchesKeyword(m, '  架A  '), true, '首尾空格裁掉');
  assert.equal(matchesKeyword(m, '不存在的关键字'), false);
});

test('matchesKeyword: 空关键字 / null / 纯空格都当不筛', () => {
  const m = msg({});
  assert.equal(matchesKeyword(m, ''), true);
  assert.equal(matchesKeyword(m, null), true);
  assert.equal(matchesKeyword(m, '   '), true);
});

test('buildSections: 搜索与筛选叠加，且不命中时不残留空段', () => {
  const msgs = [
    normalizeMessage(msg({ id: 1, positionLabel: '1-2', adviceText: '' })),
    normalizeMessage(msg({ id: 2, positionLabel: '9-9', adviceText: '' })),
  ];
  const hit = buildSections(msgs, null, 'all', '1-2');
  assert.equal(hit[0].count, 1);
  assert.equal(hit[0].groups[0].items[0].posText, '1-2');

  assert.deepEqual(buildSections(msgs, null, 'all', '搜不到'), []);
  assert.deepEqual(buildSections(msgs, null, 'replied', '1-2'), [], '搜得到但筛选不通过 → 也是空');
});

test('filterCounts: 计数跟着关键字走，全部 = 待回 + 已回', () => {
  const msgs = [
    normalizeMessage(msg({ id: 1, positionLabel: '1-2', adviceText: '' })),
    normalizeMessage(msg({ id: 2, positionLabel: '2-4', adviceText: '已换水' })),
    normalizeMessage(msg({ id: 3, positionLabel: '9-9', adviceText: '' })),
  ];
  assert.deepEqual(filterCounts(msgs, ''), { all: 3, pending: 2, replied: 1 });
  assert.deepEqual(filterCounts(msgs, '9-9'), { all: 1, pending: 1, replied: 0 });
  assert.deepEqual(filterCounts(msgs, '搜不到'), { all: 0, pending: 0, replied: 0 });
  assert.deepEqual(filterCounts(null, ''), { all: 0, pending: 0, replied: 0 });
});
