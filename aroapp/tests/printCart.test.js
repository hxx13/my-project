'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCart, templateKeyOf } = require('../miniprogram/package-feature/utils/printCart.js');

const STORAGE_KEY = 'print-station:cart';

/** 内存假 storage，默认「找不到返回 null」——和 Web 的 localStorage 一样。 */
function fakeStorage(initial) {
  const map = Object.assign({}, initial);
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = v; },
    raw: () => map,
  };
}

/** 模拟 wx.getStorageSync：找不到返回空字符串而不是 null。 */
function wxLikeStorage(initial) {
  const map = Object.assign({}, initial);
  return {
    getItem: (k) => (k in map ? map[k] : ''),
    setItem: (k, v) => { map[k] = v; },
    raw: () => map,
  };
}

const item = (sourceType, sourceId, fileName) => ({ sourceType, sourceId, fileName });

// ---------------------------------------------------------------- 初始 / 降级
test('空存储：返回空清单', () => {
  const cart = createCart(fakeStorage());
  assert.deepEqual(cart.getState(), { templateItems: [], localFiles: [], overrides: {} });
  assert.equal(cart.count(), 0);
});

test('空字符串存储值：当没存储，不抛（小程序特有）', () => {
  const cart = createCart(wxLikeStorage({ [STORAGE_KEY]: '' }));
  assert.deepEqual(cart.getState(), { templateItems: [], localFiles: [], overrides: {} });
});

test('坏 JSON：降级空清单不抛', () => {
  const cart = createCart(fakeStorage({ [STORAGE_KEY]: '{不是 json' }));
  assert.deepEqual(cart.getState(), { templateItems: [], localFiles: [], overrides: {} });
});

test('合法 JSON 但整个是数组：降级空清单', () => {
  const cart = createCart(fakeStorage({ [STORAGE_KEY]: '[1,2,3]' }));
  assert.deepEqual(cart.getState(), { templateItems: [], localFiles: [], overrides: {} });
});

test('templateItems 是字符串：降级空清单', () => {
  const cart = createCart(fakeStorage({ [STORAGE_KEY]: '{"templateItems":"x","overrides":{}}' }));
  assert.deepEqual(cart.getState(), { templateItems: [], localFiles: [], overrides: {} });
});

test('overrides 是 null：降级空清单', () => {
  const cart = createCart(fakeStorage({ [STORAGE_KEY]: '{"templateItems":[],"overrides":null}' }));
  assert.deepEqual(cart.getState(), { templateItems: [], localFiles: [], overrides: {} });
});

test('getItem 本身抛异常：降级空清单不抛', () => {
  const cart = createCart({
    getItem: () => { throw new Error('boom'); },
    setItem: () => {},
  });
  assert.deepEqual(cart.getState(), { templateItems: [], localFiles: [], overrides: {} });
});

test('合法数据能被读回（持久化）', () => {
  const storage = fakeStorage({
    [STORAGE_KEY]: JSON.stringify({
      templateItems: [item('ADMIN_FILE', '7', 'a.pdf')],
      overrides: { 'ADMIN_FILE:7': { copies: 3 } },
    }),
  });
  const cart = createCart(storage);
  assert.deepEqual(cart.getState().templateItems, [item('ADMIN_FILE', '7', 'a.pdf')]);
  assert.deepEqual(cart.getState().overrides, { 'ADMIN_FILE:7': { copies: 3 } });
  assert.deepEqual(cart.getState().localFiles, []);
});

// ---------------------------------------------------------------- templateKeyOf
test('templateKeyOf: sourceType:sourceId', () => {
  assert.equal(templateKeyOf(item('ADMIN_FILE', '9', 'x.pdf')), 'ADMIN_FILE:9');
});

// ---------------------------------------------------------------- addTemplateItems
test('addTemplateItems: 按 sourceType:sourceId 去重，重复静默跳过', () => {
  const cart = createCart(fakeStorage());
  cart.addTemplateItems([item('ADMIN_FILE', '1', 'a.pdf'), item('ADMIN_FILE', '2', 'b.pdf')]);
  cart.addTemplateItems([item('ADMIN_FILE', '2', 'b.pdf'), item('ADMIN_FILE', '3', 'c.pdf')]);
  assert.deepEqual(cart.getState().templateItems.map(templateKeyOf), [
    'ADMIN_FILE:1', 'ADMIN_FILE:2', 'ADMIN_FILE:3',
  ]);
  assert.equal(cart.count(), 3);
});

test('addTemplateItems: 写进 storage', () => {
  const storage = fakeStorage();
  const cart = createCart(storage);
  cart.addTemplateItems([item('ADMIN_FILE', '1', 'a.pdf')]);
  const saved = JSON.parse(storage.raw()[STORAGE_KEY]);
  assert.deepEqual(saved.templateItems, [item('ADMIN_FILE', '1', 'a.pdf')]);
  assert.deepEqual(saved.overrides, {});
  assert.equal('localFiles' in saved, false);
});

// ---------------------------------------------------------------- addLocalFiles
test('addLocalFiles: 每条唯一 key，前缀 local:，不去重', () => {
  const cart = createCart(fakeStorage());
  const f = { name: 'tmp.pdf' };
  cart.addLocalFiles([f, f]);
  const keys = cart.getState().localFiles.map((l) => l.key);
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);
  assert.ok(keys.every((k) => /^local:\d+$/.test(k)));
  assert.deepEqual(cart.getState().localFiles.map((l) => l.name), ['tmp.pdf', 'tmp.pdf']);
});

test('addLocalFiles: 绝不写进 storage', () => {
  const storage = fakeStorage();
  const cart = createCart(storage);
  cart.addLocalFiles([{ name: 'tmp.pdf' }]);
  assert.equal(cart.getState().localFiles.length, 1);
  const saved = JSON.parse(storage.raw()[STORAGE_KEY]);
  assert.equal('localFiles' in saved, false);
  // 重新构造一个 cart，localFiles 不该回来
  const cart2 = createCart(storage);
  assert.deepEqual(cart2.getState().localFiles, []);
});

// ---------------------------------------------------------------- remove
test('remove: 移除模板项并同时删掉它的 override', () => {
  const cart = createCart(fakeStorage());
  cart.addTemplateItems([item('ADMIN_FILE', '1', 'a.pdf')]);
  cart.setOverride('ADMIN_FILE:1', { copies: 5 });
  cart.remove('ADMIN_FILE:1');
  assert.deepEqual(cart.getState().templateItems, []);
  assert.deepEqual(cart.getState().overrides, {});
});

test('remove: 移除后重新加入不带回旧覆盖（Web 修过的坑）', () => {
  const cart = createCart(fakeStorage());
  cart.addTemplateItems([item('ADMIN_FILE', '1', 'a.pdf')]);
  cart.setOverride('ADMIN_FILE:1', { copies: 5, urgent: true });
  cart.remove('ADMIN_FILE:1');
  cart.addTemplateItems([item('ADMIN_FILE', '1', 'a.pdf')]);
  assert.deepEqual(cart.getState().overrides['ADMIN_FILE:1'], undefined);
});

test('remove: 也能按 key 移除 local 条目', () => {
  const cart = createCart(fakeStorage());
  cart.addLocalFiles([{ name: 'tmp.pdf' }]);
  const key = cart.getState().localFiles[0].key;
  cart.remove(key);
  assert.deepEqual(cart.getState().localFiles, []);
});

test('remove: 不存在的 key 不抛、状态不变', () => {
  const cart = createCart(fakeStorage());
  cart.addTemplateItems([item('ADMIN_FILE', '1', 'a.pdf')]);
  cart.setOverride('ADMIN_FILE:1', { copies: 2 });
  const before = cart.getState();
  assert.doesNotThrow(() => cart.remove('NOPE:0'));
  assert.deepEqual(cart.getState(), before);
});

// ---------------------------------------------------------------- setOverride
test('setOverride: 浅合并进 overrides[key]', () => {
  const cart = createCart(fakeStorage());
  cart.setOverride('ADMIN_FILE:1', { copies: 2 });
  cart.setOverride('ADMIN_FILE:1', { urgent: true });
  assert.deepEqual(cart.getState().overrides['ADMIN_FILE:1'], { copies: 2, urgent: true });
});

test('setOverride: key 不存在也照写（覆盖可能先于条目到）', () => {
  const cart = createCart(fakeStorage());
  assert.doesNotThrow(() => cart.setOverride('ADMIN_FILE:9', { copies: 1 }));
  assert.deepEqual(cart.getState().overrides['ADMIN_FILE:9'], { copies: 1 });
});

// ---------------------------------------------------------------- clear / count
test('clear: 连 overrides 一起清，并落盘', () => {
  const storage = fakeStorage();
  const cart = createCart(storage);
  cart.addTemplateItems([item('ADMIN_FILE', '1', 'a.pdf')]);
  cart.addLocalFiles([{ name: 'tmp.pdf' }]);
  cart.setOverride('ADMIN_FILE:1', { copies: 2 });
  cart.clear();
  assert.deepEqual(cart.getState(), { templateItems: [], localFiles: [], overrides: {} });
  const saved = JSON.parse(storage.raw()[STORAGE_KEY]);
  assert.deepEqual(saved, { templateItems: [], overrides: {} });
});

test('count: 模板项 + 本地文件', () => {
  const cart = createCart(fakeStorage());
  cart.addTemplateItems([item('ADMIN_FILE', '1', 'a.pdf'), item('ADMIN_FILE', '2', 'b.pdf')]);
  cart.addLocalFiles([{ name: 'tmp.pdf' }]);
  assert.equal(cart.count(), 3);
});
