'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  filterTemplates,
  summarizeQueue,
  mapJobRow,
  stationNameMap,
  buildStationTabs,
  stationCapabilityText,
  stationStatusMeta,
} = require('../miniprogram/package-feature/utils/printFormat.js');

// ---------------------------------------------------------------- filterTemplates
test('filterTemplates: 空/纯空格关键字返回原数组', () => {
  const rows = [
    { originalName: 'a.pdf' },
    { originalName: 'b.docx' },
    { originalName: 'H5.pdf' },
  ];
  assert.equal(filterTemplates(rows, '').length, 3);
  assert.equal(filterTemplates(rows, '   ').length, 3);
  assert.equal(filterTemplates(rows, null).length, 3);
  assert.equal(filterTemplates(rows, undefined).length, 3);
});

test('filterTemplates: 大小写不敏感', () => {
  const rows = [{ originalName: 'H5.pdf' }, { originalName: 'other.docx' }];
  assert.deepEqual(filterTemplates(rows, 'h5'), [{ originalName: 'H5.pdf' }]);
  assert.deepEqual(filterTemplates(rows, 'H5'), [{ originalName: 'H5.pdf' }]);
});

test('filterTemplates: 中文子串匹配', () => {
  const rows = [
    { originalName: '2026巡查工作记录.docx' },
    { originalName: '其他.pdf' },
  ];
  assert.deepEqual(filterTemplates(rows, '巡查'), [
    { originalName: '2026巡查工作记录.docx' },
  ]);
});

test('filterTemplates: 无命中返回空数组', () => {
  const rows = [{ originalName: 'a.pdf' }];
  assert.deepEqual(filterTemplates(rows, 'nope'), []);
});

test('filterTemplates: rows 为 null/undefined 返回空数组不抛', () => {
  assert.deepEqual(filterTemplates(null, 'x'), []);
  assert.deepEqual(filterTemplates(undefined, 'x'), []);
});

test('filterTemplates: originalName 缺失不抛，且被排除', () => {
  const rows = [{}, { originalName: undefined }, { originalName: 'hit.pdf' }];
  assert.deepEqual(filterTemplates(rows, 'hit'), [{ originalName: 'hit.pdf' }]);
  assert.deepEqual(filterTemplates(rows, 'zzz'), []);
});

// ---------------------------------------------------------------- summarizeQueue
test('summarizeQueue: 空数组', () => {
  assert.deepEqual(summarizeQueue([]), {
    sent: 0,
    pending: 0,
    hasActive: false,
  });
});

test('summarizeQueue: 只统计 PENDING / SENT', () => {
  const jobs = [
    { status: 'PENDING' },
    { status: 'SENT' },
    { status: 'PRINTED' },
    { status: 'FAILED' },
    { status: 'CANCELLED' },
  ];
  assert.deepEqual(summarizeQueue(jobs), {
    sent: 1,
    pending: 1,
    hasActive: true,
  });
});

test('summarizeQueue: 未知状态既不计数也不抛', () => {
  const jobs = [{ status: 'RETRYING' }, { status: 'SENT' }];
  assert.deepEqual(summarizeQueue(jobs), {
    sent: 1,
    pending: 0,
    hasActive: true,
  });
});

test('summarizeQueue: hasActive 由 sent+pending 决定', () => {
  assert.equal(summarizeQueue([{ status: 'PRINTED' }]).hasActive, false);
  assert.equal(summarizeQueue([{ status: 'PENDING' }]).hasActive, true);
});

test('summarizeQueue: jobs 为 null/undefined', () => {
  assert.deepEqual(summarizeQueue(null), {
    sent: 0,
    pending: 0,
    hasActive: false,
  });
  assert.deepEqual(summarizeQueue(undefined), {
    sent: 0,
    pending: 0,
    hasActive: false,
  });
});

// ---------------------------------------------------------------- mapJobRow
test('mapJobRow: null/undefined 返回 null', () => {
  assert.equal(mapJobRow(null), null);
  assert.equal(mapJobRow(undefined), null);
});

test('mapJobRow: 完整字段映射', () => {
  const row = mapJobRow({
    id: 42,
    fileName: '巡查表.pdf',
    copies: 2,
    status: 'SENT',
    lastError: '打印机离线',
    createdAt: '2026-09-15T14:19:31',
  });
  assert.deepEqual(row, {
    id: 42,
    fileName: '巡查表.pdf',
    copies: 2,
    statusText: '打印中',
    tone: 'info',
    timeText: '2026-09-15 14:19',
    stationName: '',
    errorText: '打印机离线',
    status: 'SENT',
    stationId: '',
    note: '',
  });
});

test('stationNameMap: 工位 id → 名称（队列要显示是哪台工位打）', () => {
  assert.deepEqual(stationNameMap([{ id: 7, name: '一号打印机' }, { id: 9, name: '二号' }]), {
    '7': '一号打印机',
    '9': '二号',
  });
  assert.deepEqual(stationNameMap(null), {});
  assert.deepEqual(stationNameMap([{ id: 1 }]), { '1': '1' });
});

test('mapJobRow: 传了工位映射就把 stationId 翻成工位名；拿不到则留空', () => {
  const names = stationNameMap([{ id: 7, name: '一号打印机' }]);
  assert.equal(mapJobRow({ id: 1, stationId: 7, status: 'PENDING' }, names).stationName, '一号打印机');
  assert.equal(mapJobRow({ id: 2, stationId: 99, status: 'PENDING' }, names).stationName, '');
  assert.equal(mapJobRow({ id: 3, status: 'PENDING' }, names).stationName, '');
});

test('mapJobRow: 时间取「打完 > 已发 > 创建」，备注与状态原样带出', () => {
  const row = mapJobRow({
    id: 1,
    status: 'PRINTED',
    stationId: 7,
    note: '放到 302 桌上',
    createdAt: '2026-09-15T09:00:00',
    sentAt: '2026-09-15T09:05:00',
    printedAt: '2026-09-15T09:06:00',
  });
  assert.equal(row.timeText, '2026-09-15 09:06');
  assert.equal(row.note, '放到 302 桌上');
  assert.equal(row.status, 'PRINTED');
  assert.equal(row.stationId, '7');
});

test('buildStationTabs: 每台工位一组，进行中排前、角标只数进行中', () => {
  const stations = [{ id: 7, name: '一号打印机' }, { id: 9, name: '二号' }];
  const jobs = [
    { id: 1, stationId: 7, status: 'PRINTED', createdAt: '2026-09-15T10:00:00' },
    { id: 2, stationId: 7, status: 'PENDING', createdAt: '2026-09-15T11:00:00' },
    { id: 3, stationId: 99, status: 'FAILED', createdAt: '2026-09-15T12:00:00' },
  ];
  const tabs = buildStationTabs(jobs, stations);
  assert.deepEqual(tabs.map((t) => t.id), ['7', '9', '99'], '以工位清单为序，记录里多出来的工位补在后面');
  assert.equal(tabs[0].name, '一号打印机');
  assert.equal(tabs[0].count, 1, '角标=进行中数量');
  assert.deepEqual(tabs[0].rows.map((r) => r.id), [2, 1], '进行中的排前面');
  assert.equal(tabs[1].rows.length, 0, '没有记录的工位也给一个空 tab');
  assert.equal(tabs[2].name, '99', '清单里没有的工位名退回 id');
});

test('mapJobRow: tone 与 statusText 映射固定', () => {
  const table = [
    ['PENDING', 'pending', '排队中'],
    ['SENT', 'info', '打印中'],
    ['PRINTED', 'ok', '已打印'],
    ['FAILED', 'bad', '失败'],
    ['CANCELLED', 'none', '已撤回'],
  ];
  for (const [status, tone, text] of table) {
    const row = mapJobRow({ status });
    assert.equal(row.tone, tone, `tone(${status})`);
    assert.equal(row.statusText, text, `statusText(${status})`);
  }
});

test('mapJobRow: 未知状态 tone 为 none 且不抛', () => {
  const row = mapJobRow({ status: 'RETRYING' });
  assert.equal(row.tone, 'none');
  assert.equal(typeof row.statusText, 'string');
  assert.ok(row.statusText.length > 0);
});

test('mapJobRow: lastError 空/null 得到空串', () => {
  assert.equal(mapJobRow({ status: 'SENT', lastError: '' }).errorText, '');
  assert.equal(mapJobRow({ status: 'SENT', lastError: null }).errorText, '');
  assert.equal(mapJobRow({ status: 'SENT' }).errorText, '');
});

test('mapJobRow: createdAt 精确到分钟，空得到空串', () => {
  assert.equal(
    mapJobRow({ status: 'SENT', createdAt: '2026-09-15T14:19:31' }).timeText,
    '2026-09-15 14:19',
  );
  assert.equal(mapJobRow({ status: 'SENT', createdAt: '' }).timeText, '');
  assert.equal(mapJobRow({ status: 'SENT', createdAt: null }).timeText, '');
});

// ---------------------------------------------------------------- stationCapabilityText
test('stationCapabilityText: 空值即不限制', () => {
  assert.equal(stationCapabilityText({ supportedTypes: null }), '不限制文件类型');
  assert.equal(
    stationCapabilityText({ supportedTypes: undefined }),
    '不限制文件类型',
  );
  assert.equal(stationCapabilityText({ supportedTypes: '' }), '不限制文件类型');
  assert.equal(stationCapabilityText({ supportedTypes: '   ' }), '不限制文件类型');
  assert.equal(stationCapabilityText({}), '不限制文件类型');
  assert.equal(stationCapabilityText(null), '不限制文件类型');
});

test('stationCapabilityText: pdf,image', () => {
  assert.equal(
    stationCapabilityText({ supportedTypes: 'pdf,image' }),
    '支持 PDF / 图片',
  );
});

test('stationCapabilityText: 五种全给，输出顺序固定', () => {
  assert.equal(
    stationCapabilityText({ supportedTypes: 'ppt,excel,word,image,pdf' }),
    '支持 PDF / 图片 / Word / Excel / PPT',
  );
});

test('stationCapabilityText: trim 且忽略大小写', () => {
  assert.equal(
    stationCapabilityText({ supportedTypes: 'PDF, Image' }),
    '支持 PDF / 图片',
  );
});

test('stationCapabilityText: 认不出的分组丢掉', () => {
  assert.equal(
    stationCapabilityText({ supportedTypes: 'pdf,zip,image' }),
    '支持 PDF / 图片',
  );
  assert.equal(
    stationCapabilityText({ supportedTypes: 'zip,rar' }),
    '不限制文件类型',
  );
});

// ---------------------------------------------------------------- stationStatusMeta
test('stationStatusMeta: 三态 tone 与文案映射固定', () => {
  const table = [
    ['ONLINE', 'ok', '在线'],
    ['OFFLINE', 'bad', '离线'],
    ['UNKNOWN', 'none', '未知'],
  ];
  for (const [status, tone, label] of table) {
    const meta = stationStatusMeta({ liveStatus: status });
    assert.equal(meta.tone, tone, `tone(${status})`);
    assert.equal(meta.label, label, `label(${status})`);
  }
});

test('stationStatusMeta: 未知状态字符串兜底 none 且不抛', () => {
  const meta = stationStatusMeta({ liveStatus: 'DEGRADED' });
  assert.equal(meta.tone, 'none');
  assert.equal(meta.label, '未知');
});

test('stationStatusMeta: liveStatus 缺失 / station 为 null 兜底不抛', () => {
  assert.deepEqual(stationStatusMeta(null), {
    tone: 'none',
    label: '未知',
    reason: '',
  });
  assert.deepEqual(stationStatusMeta(undefined), {
    tone: 'none',
    label: '未知',
    reason: '',
  });
  assert.deepEqual(stationStatusMeta({}), {
    tone: 'none',
    label: '未知',
    reason: '',
  });
});

test('stationStatusMeta: liveStatusReason 透传并 trim', () => {
  const meta = stationStatusMeta({
    liveStatus: 'OFFLINE',
    liveStatusReason: ' 最后心跳 2 分钟前 ',
  });
  assert.equal(meta.reason, '最后心跳 2 分钟前');
});

test('stationStatusMeta: liveStatusReason 空/null/空白时 reason 为空串', () => {
  assert.equal(
    stationStatusMeta({ liveStatus: 'OFFLINE', liveStatusReason: '' }).reason,
    '',
  );
  assert.equal(
    stationStatusMeta({ liveStatus: 'OFFLINE', liveStatusReason: null }).reason,
    '',
  );
  assert.equal(stationStatusMeta({ liveStatus: 'OFFLINE' }).reason, '');
  assert.equal(
    stationStatusMeta({ liveStatus: 'OFFLINE', liveStatusReason: '   ' }).reason,
    '',
  );
});
