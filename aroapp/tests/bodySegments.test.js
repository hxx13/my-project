'use strict';
/**
 * 回归：公告正文切段（2026-09-22 加）。
 *
 * `<rich-text>` 里的图片收不到点击事件、点不开大图，所以详情页把 img 抠出来用
 * `<image bindtap>` 单独渲染。两件事必须成立：正文顺序不能变、图片宽度要跟编辑器一致
 * （拖过就沿用，没拖过满宽）。切错了表现为「图跑到文末 / 图忽大忽小」。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { splitBodySegments } = require('../miniprogram/utils/richTextTypography.js');

const IMG_50 = '<img src="https://x/a.png" style="width: 50%; max-width: 100%; height: auto; display: inline-block; box-sizing: border-box;">';

test('纯文字不切段', () => {
  const segs = splitBodySegments('<p>只有文字</p>');
  assert.equal(segs.length, 1);
  assert.equal(segs[0].type, 'html');
  assert.equal(segs[0].html, '<p>只有文字</p>');
});

test('中间的图按位置切开，顺序不变', () => {
  const segs = splitBodySegments('<p>前</p>' + IMG_50 + '<p>后</p>');
  assert.deepEqual(segs.map((s) => s.type), ['html', 'img', 'html']);
  assert.equal(segs[0].html, '<p>前</p>');
  assert.equal(segs[1].src, 'https://x/a.png');
  assert.equal(segs[2].html, '<p>后</p>');
});

test('图在首尾时不产生空 html 段', () => {
  const segs = splitBodySegments(IMG_50);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].type, 'img');
});

test('图片独占段落时，切剩的 <p>/</p> 空壳不渲染（否则图上下多空行）', () => {
  const segs = splitBodySegments('<p>' + IMG_50 + '</p>');
  assert.deepEqual(segs.map((s) => s.type), ['img']);
  // 段落里还有文字时，文字那段要留着（只是尾部 </p> 空壳丢掉）
  const mixed = splitBodySegments('<p>文字' + IMG_50 + '</p>');
  assert.deepEqual(mixed.map((s) => s.type), ['html', 'img']);
  assert.equal(mixed[0].html, '<p>文字');
  // 有版面意义的标签不能当空壳丢：<hr> 前后是纯标签但也得留着
  const withHr = splitBodySegments('<hr>' + IMG_50);
  assert.deepEqual(withHr.map((s) => s.type), ['html', 'img']);
});

test('拖过的宽度沿用，没拖过的满宽，超 100 收口', () => {
  assert.equal(splitBodySegments(IMG_50)[0].width, 50);
  assert.equal(splitBodySegments('<img src="https://x/b.png">')[0].width, 100);
  assert.equal(splitBodySegments('<img src="https://x/c.png" style="width: 120%;">')[0].width, 100);
  assert.equal(splitBodySegments('<img src="https://x/d.png" style="width: 75%">')[0].width, 75);
});

test('单引号 src 与自闭合标签都认', () => {
  const segs = splitBodySegments("<p><img src='https://x/e.png' /></p>");
  assert.equal(segs[0].type, 'img');
  assert.equal(segs[0].src, 'https://x/e.png');
});

test('多张图各成一段，key 连续', () => {
  const segs = splitBodySegments('<p>a</p>' + IMG_50 + '<p>b</p>' + IMG_50 + '<p>c</p>');
  assert.deepEqual(segs.map((s) => s.type), ['html', 'img', 'html', 'img', 'html']);
  assert.deepEqual(segs.map((s) => s.key), [0, 1, 2, 3, 4]);
});

test('空正文返回空数组', () => {
  assert.deepEqual(splitBodySegments(''), []);
  assert.deepEqual(splitBodySegments(null), []);
  assert.deepEqual(splitBodySegments(undefined), []);
});
