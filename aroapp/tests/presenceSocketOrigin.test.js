/**
 * 回归：Socket.IO 地址推导。
 * 9092 是明文 Netty（无 TLS），TLS 只在 443 终止、nginx 按 /socket.io/ 代理到 9092。
 * 所以 https 侧绝不能自己拼 :9092 —— 那是「对着明文端口做 TLS 握手」，线上必连不上，
 * 只会一直吃 25s 轮询兜底。规则与 H5 frontend/src/config/socketUrl.ts 一致。
 */
const test = require('node:test');
const assert = require('node:assert');

const store = { springApiPublicBaseUrl: '', springUploadPublicBaseUrl: '' };
global.wx = {
  getStorageSync: (k) => store[k] || '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
};

const { resolveSocketOrigin } = require('../miniprogram/utils/studentPresenceSocket.js');

test('https 基址：不拼端口，走 nginx 同域代理', () => {
  store.springApiPublicBaseUrl = 'https://aroultra.shsmu.edu.cn';
  assert.equal(resolveSocketOrigin(), 'wss://aroultra.shsmu.edu.cn');
  store.springApiPublicBaseUrl = 'https://localhost:8081';
  assert.equal(resolveSocketOrigin(), 'wss://localhost');
});

test('http 基址：直连 9092 明文', () => {
  store.springApiPublicBaseUrl = 'http://10.0.0.5:8081';
  assert.equal(resolveSocketOrigin(), 'ws://10.0.0.5:9092');
});

test('API 基址缺失时回退上传基址，规则相同', () => {
  store.springApiPublicBaseUrl = '';
  store.springUploadPublicBaseUrl = 'https://cdn.example.com';
  assert.equal(resolveSocketOrigin(), 'wss://cdn.example.com');
  store.springUploadPublicBaseUrl = 'http://cdn.example.com';
  assert.equal(resolveSocketOrigin(), 'ws://cdn.example.com:9092');
});

test('都没有基址时返回空串（调用方走轮询兜底）', () => {
  store.springApiPublicBaseUrl = '';
  store.springUploadPublicBaseUrl = '';
  assert.equal(resolveSocketOrigin(), '');
});
