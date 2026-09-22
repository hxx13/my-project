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

/**
 * 图片单独占一个段落（`<p><img></p>`，编辑器插图就是这种）时，切完会剩 `<p>` 和 `</p>`
 * 两个空壳 —— 各自渲染成一段空行，图上下就多一块空白。只认「纯 p/div 标签 + 空白」的块，
 * `<br>`/`<hr>`/`<ul>` 这些有版面意义的照旧保留。
 */
function isWrapperOnly(chunk) {
  return /^(?:\s|<\/?(?:p|div)>)*$/i.test(chunk);
}

/**
 * 正文按 <img> 切成「HTML 段 / 图片段」。
 *
 * 为什么必须切：`<rich-text>` 里的图片收不到点击事件、点不开大图，只能把 img 抠出来
 * 用 `<image bindtap>` 单独渲染。切段而不是「把所有图抽出来堆到底部」，是为了不重排正文顺序。
 *
 * 图片宽度：作者在编辑器里拖过宽度就沿用（inline `width: N%`），没拖过给满宽 ——
 * 与 web / H5 同口径（frontend/src/styles/rich-text-content.css）。
 */
function splitBodySegments(html) {
  if (!html) return [];
  var re = /<img\b[^>]*\/?>/gi;
  var out = [];
  var last = 0;
  var m;
  while ((m = re.exec(html)) !== null) {
    var before = html.slice(last, m.index);
    if (before && !isWrapperOnly(before)) out.push({ type: 'html', html: before });
    var src = /src\s*=\s*["']([^"']+)["']/i.exec(m[0]);
    if (src && src[1]) {
      var w = /width\s*:\s*(\d+(?:\.\d+)?)\s*%/i.exec(m[0]);
      out.push({ type: 'img', src: src[1], width: w ? Math.min(100, parseFloat(w[1])) : 100 });
    }
    last = m.index + m[0].length;
  }
  var tail = html.slice(last);
  if (tail && !isWrapperOnly(tail)) out.push({ type: 'html', html: tail });
  // wx:for 需要稳定 key：切出来的段本身没有 id，用下标
  return out.map(function (seg, i) { return Object.assign({ key: i }, seg); });
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
  splitBodySegments: splitBodySegments,
};
