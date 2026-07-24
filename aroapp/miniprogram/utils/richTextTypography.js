/**
 * 小程序 rich-text 排版令牌
 * Impeccable 产品 UI：固定 rpx 阶梯（步进 ~1.125–1.2）、正文对比度 ≥4.5:1
 * rich-text HTML 模式不继承外层 wxss，须内联 style（px ≈ rpx/2 @375pt 宽）
 */
var FONT_STACK = "-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,'PingFang SC','Microsoft YaHei',sans-serif";

var COLOR_TEXT = '#323233';
var COLOR_TEXT_SECONDARY = '#646566';

/** 设计宽 750 下的 rpx 阶梯，供 wxss 引用 */
var SIZES_RPX = {
  small: 24,
  body: 30,
  h3: 32,
  h2: 36,
  h1: 40,
  code: 26,
};

/** rich-text 内联 px（≈ rpx/2） */
var SIZES_PX = {
  small: 12,
  body: 15,
  h3: 16,
  h2: 18,
  h1: 20,
  code: 13,
};

function px(n) {
  return n + 'px';
}

var STYLES = {
  base: 'font-family:' + FONT_STACK + ';color:' + COLOR_TEXT + ';word-break:break-word;',
  h1: 'font-size:' + px(SIZES_PX.h1) + ';font-weight:700;line-height:1.35;margin:16px 0 8px;',
  h2: 'font-size:' + px(SIZES_PX.h2) + ';font-weight:600;line-height:1.4;margin:14px 0 8px;',
  h3: 'font-size:' + px(SIZES_PX.h3) + ';font-weight:600;line-height:1.45;margin:12px 0 6px;',
  p: 'font-size:' + px(SIZES_PX.body) + ';line-height:1.55;margin:0 0 10px;',
  li: 'font-size:' + px(SIZES_PX.body) + ';line-height:1.55;margin:0 0 6px;',
  ul: 'padding-left:20px;margin:0 0 10px;list-style-type:disc;',
  ol: 'padding-left:20px;margin:0 0 10px;list-style-type:decimal;',
  blockquote:
    'margin:8px 0 12px;padding:8px 12px;border-left:3px solid #ebedf0;color:' +
    COLOR_TEXT_SECONDARY +
    ';font-size:' +
    px(SIZES_PX.body) +
    ';line-height:1.55;',
  strong: 'font-weight:600;',
  em: 'font-style:italic;',
  code:
    'font-family:ui-monospace,monospace;font-size:' +
    px(SIZES_PX.code) +
    ';background:#f7f8fa;padding:2px 6px;border-radius:4px;',
  a: 'color:#ac1736;text-decoration:none;',
  img: 'max-width:100%;height:auto;display:block;margin:8px 0;border-radius:8px;',
  hr: 'border:none;border-top:1px solid #ebedf0;margin:12px 0;',
};

function tagStyle(tag) {
  if (tag === 'img') return STYLES.base + STYLES.img;
  if (tag === 'hr') return STYLES.base + STYLES.hr;
  var specific = STYLES[tag];
  if (tag === 'ul' || tag === 'ol') return STYLES.base + (specific || '');
  return STYLES.base + (specific || '');
}

function styledOpenTag(tag, extraAttrs) {
  var attrs = extraAttrs ? ' ' + extraAttrs : '';
  return '<' + tag + ' style="' + tagStyle(tag) + '"' + attrs + '>';
}

function styledTag(tag, innerHtml) {
  return styledOpenTag(tag) + innerHtml + '</' + tag + '>';
}

/** 为已有 HTML 补排版（跳过已有 style 的标签） */
function applyRichTextTypography(html) {
  if (!html || typeof html !== 'string') return '';
  var s = html;
  var tags = ['h1', 'h2', 'h3', 'p', 'li', 'ul', 'ol', 'blockquote', 'strong', 'em', 'code', 'a'];
  tags.forEach(function (tag) {
    var re = new RegExp('<' + tag + '(?![^>]*\\bstyle=)(\\s[^>]*)?>', 'gi');
    s = s.replace(re, function (_m, attrs) {
      attrs = attrs || '';
      return '<' + tag + ' style="' + tagStyle(tag) + '"' + attrs + '>';
    });
  });
  s = s.replace(/<img(?![^>]*\bstyle=)([^>]*)\/?>/gi, function (_m, attrs) {
    return '<img style="' + tagStyle('img') + '"' + attrs + '/>';
  });
  s = s.replace(/<hr(?![^>]*\bstyle=)(\s[^>]*)?\/?>/gi, function (_m, attrs) {
    attrs = attrs || '';
    return '<hr style="' + tagStyle('hr') + '"' + attrs + '/>';
  });
  return s;
}

module.exports = {
  SIZES_RPX: SIZES_RPX,
  SIZES_PX: SIZES_PX,
  COLOR_TEXT: COLOR_TEXT,
  COLOR_TEXT_SECONDARY: COLOR_TEXT_SECONDARY,
  tagStyle: tagStyle,
  styledTag: styledTag,
  styledOpenTag: styledOpenTag,
  applyRichTextTypography: applyRichTextTypography,
};
