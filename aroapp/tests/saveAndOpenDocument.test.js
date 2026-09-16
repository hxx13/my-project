'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * 共享收尾 saveAndOpenDocument 的配额自愈。
 * USER_DATA_PATH 只有 10MB，导出/预览只写不删，写多了必然撑满——
 * 这里锁住「配额满 → 清一轮历史导出（只清文档、不删本次目标）→ 重写一次」的行为。
 */

let currentWx = {};
// wx 在调用期才被读取，用代理转发到当前用例的桩，避免模块只加载一次却要换桩
global.wx = new Proxy({}, {
  get(t, k) {
    if (k in currentWx) return currentWx[k];
    return () => ({});
  },
});

const { saveAndOpenDocument } = require('../miniprogram/utils/springAuth.js');

const QUOTA_MSG = 'writeFile:fail the maximum size of the file storage limit is exceeded';
const UD = '/tmp/ud';

/** 造一个可编程的文件系统桩，并记录调用。 */
function makeWx(fsFactory) {
  const calls = { write: [], unlink: [], readdir: 0, open: [] };
  const w = {
    env: { USER_DATA_PATH: UD },
    getFileSystemManager: () => fsFactory(calls),
    openDocument: (o) => calls.open.push(o),
  };
  currentWx = w;
  return calls;
}

function fsOk(calls) {
  return {
    writeFile: (o) => { calls.write.push(o.filePath); o.success && o.success(); },
    unlink: (o) => calls.unlink.push(o.filePath),
    readdir: (o) => { calls.readdir += 1; o.success && o.success([]); o.complete && o.complete(); },
  };
}

test('正常写入：只写一次、不扫盘、按 fileType 打开', async () => {
  const calls = makeWx(fsOk);
  const p = await saveAndOpenDocument(new ArrayBuffer(8), '我的报表.xlsx', 'xlsx');
  assert.equal(p, `${UD}/我的报表.xlsx`);
  assert.deepEqual(calls.write, [`${UD}/我的报表.xlsx`]);
  assert.equal(calls.readdir, 0);
  assert.equal(calls.unlink.length, 0);
  assert.equal(calls.open.length, 1);
  assert.equal(calls.open[0].fileType, 'xlsx');
  assert.equal(calls.open[0].filePath, p);
});

test('文件名非法字符替换为下划线（保留中文与点）', async () => {
  const calls = makeWx(fsOk);
  const p = await saveAndOpenDocument(new ArrayBuffer(2), 'a/b:c*?.pdf', 'pdf');
  assert.equal(p, `${UD}/a_b_c__.pdf`);
});

test('配额满：扫掉目录里的历史文档再重写一次；不删本次目标、不碰非文档', async () => {
  const calls = makeWx((c) => ({
    writeFile: (o) => {
      c.write.push(o.filePath);
      if (c.write.length === 1) return o.fail({ errMsg: QUOTA_MSG });
      o.success && o.success();
    },
    unlink: (o) => c.unlink.push(o.filePath),
    readdir: (o) => {
      c.readdir += 1;
      o.success && o.success(['cards-1.pdf', 'old.xlsx', 'pic.png', 'target.pdf']);
      o.complete && o.complete();
    },
  }));
  const p = await saveAndOpenDocument(new ArrayBuffer(4), 'target.pdf', 'pdf');
  assert.equal(calls.write.length, 2, '失败后重写一次');
  assert.equal(calls.readdir, 1, '触发一次扫盘');
  assert.deepEqual(
    calls.unlink,
    [`${UD}/cards-1.pdf`, `${UD}/old.xlsx`],
    '只清文档：png 不动、本次目标 target.pdf 不删'
  );
  assert.equal(calls.open.length, 1);
  assert.equal(calls.open[0].fileType, 'pdf');
  assert.equal(p, `${UD}/target.pdf`);
});

test('非配额错误：直接抛，不扫盘、不打开', async () => {
  const calls = makeWx((c) => ({
    writeFile: (o) => { c.write.push(o.filePath); o.fail({ errMsg: 'writeFile:fail no such file or directory' }); },
    unlink: (o) => c.unlink.push(o.filePath),
    readdir: (o) => { c.readdir += 1; o.complete && o.complete(); },
  }));
  let threw = null;
  try {
    await saveAndOpenDocument(new ArrayBuffer(1), 'x.pdf', 'pdf');
  } catch (e) {
    threw = e;
  }
  assert.ok(threw, '应当抛出');
  assert.equal(calls.readdir, 0, '非配额错不该扫盘');
  assert.equal(calls.open.length, 0);
});

test('扫盘后仍写不进去：如实抛出，交给调用方提示', async () => {
  const calls = makeWx((c) => ({
    writeFile: (o) => { c.write.push(o.filePath); o.fail({ errMsg: QUOTA_MSG }); },
    unlink: (o) => c.unlink.push(o.filePath),
    readdir: (o) => { c.readdir += 1; o.success && o.success(['a.pdf']); o.complete && o.complete(); },
  }));
  let threw = null;
  try {
    await saveAndOpenDocument(new ArrayBuffer(1), 'a.pdf', 'pdf');
  } catch (e) {
    threw = e;
  }
  assert.ok(threw, '清理后仍失败要抛出，不能静默');
  assert.equal(calls.write.length, 2);
  assert.equal(calls.readdir, 1);
  assert.equal(calls.open.length, 0, '写失败不该打开');
});

test('readdir 失败：不抛，照常抛出原写入错误', async () => {
  const calls = makeWx((c) => ({
    writeFile: (o) => { c.write.push(o.filePath); o.fail({ errMsg: QUOTA_MSG }); },
    unlink: (o) => c.unlink.push(o.filePath),
    readdir: (o) => { c.readdir += 1; o.fail && o.fail({ errMsg: 'readdir:fail' }); o.complete && o.complete(); },
  }));
  let threw = null;
  try {
    await saveAndOpenDocument(new ArrayBuffer(1), 'a.pdf', 'pdf');
  } catch (e) {
    threw = e;
  }
  assert.ok(threw);
  assert.equal(calls.readdir, 1);
  assert.equal(calls.unlink.length, 0);
});
