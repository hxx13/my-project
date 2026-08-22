/**
 * 发布正文 → 微信小程序 rich-text 适配。
 *
 * 设计：JSON 为真源、HTML 为派生缓存；小程序仍读 HTML，但对 TipTap/管理端
 * 富文本更挑剔（不支持的标签、相对图片、实体二次转义等）。
 * 统一在此清洗后再套排版令牌。
 */
var typo = require('./richTextTypography.js');
var springAuth = require('./springAuth.js');

function decodeHtmlEntitiesIfNeeded(raw) {
  var text = String(raw == null ? '' : raw).trim();
  if (!text || text.indexOf('&') < 0) return text;
  if (text.indexOf('<') >= 0 && text.indexOf('&lt;') < 0) return text;
  return text
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

function escapeText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** TipTap JSON（doc）→ 简易 HTML；解析失败返回空串 */
function tipTapJsonToHtml(raw) {
  if (raw == null || raw === '') return '';
  var doc = raw;
  if (typeof raw === 'string') {
    var t = raw.trim();
    if (!t || (t.charAt(0) !== '{' && t.charAt(0) !== '[')) return '';
    try {
      doc = JSON.parse(t);
    } catch (e) {
      return '';
    }
  }
  if (!doc || typeof doc !== 'object') return '';

  function marksOpen(marks) {
    var open = '';
    var close = '';
    (marks || []).forEach(function (m) {
      var type = m && m.type;
      if (type === 'bold' || type === 'strong') {
        open += '<strong>';
        close = '</strong>' + close;
      } else if (type === 'italic' || type === 'em') {
        open += '<em>';
        close = '</em>' + close;
      } else if (type === 'code') {
        open += '<code>';
        close = '</code>' + close;
      } else if (type === 'link' && m.attrs && m.attrs.href) {
        open += '<a href="' + escapeText(String(m.attrs.href)) + '">';
        close = '</a>' + close;
      } else if (type === 'highlight' || type === 'underline' || type === 'textStyle') {
        // rich-text 对 mark/彩色 span 不稳定，降级为 strong/普通文本
        open += '<span>';
        close = '</span>' + close;
      }
    });
    return { open: open, close: close };
  }

  function renderInline(nodes) {
    if (!Array.isArray(nodes)) return '';
    return nodes.map(function (n) {
      if (!n) return '';
      if (n.type === 'text') {
        var mk = marksOpen(n.marks);
        return mk.open + escapeText(n.text || '') + mk.close;
      }
      if (n.type === 'hardBreak' || n.type === 'hard_break') return '<br/>';
      if (n.type === 'image' && n.attrs && n.attrs.src) {
        return '<img src="' + escapeText(String(n.attrs.src)) + '"/>';
      }
      return renderInline(n.content);
    }).join('');
  }

  function renderBlock(node) {
    if (!node || typeof node !== 'object') return '';
    var type = node.type;
    var inner = renderInline(node.content);
    if (type === 'paragraph') return '<p>' + (inner || '<br/>') + '</p>';
    if (type === 'heading') {
      var level = Math.min(3, Math.max(1, Number((node.attrs && node.attrs.level) || 2)));
      return '<h' + level + '>' + (inner || '') + '</h' + level + '>';
    }
    if (type === 'blockquote') return '<blockquote>' + renderNodes(node.content) + '</blockquote>';
    if (type === 'bulletList') return '<ul>' + renderNodes(node.content) + '</ul>';
    if (type === 'orderedList') return '<ol>' + renderNodes(node.content) + '</ol>';
    if (type === 'listItem') return '<li>' + (inner || renderNodes(node.content)) + '</li>';
    if (type === 'horizontalRule') return '<hr/>';
    if (type === 'codeBlock') return '<pre><code>' + escapeText(plainFromNodes(node.content)) + '</code></pre>';
    if (type === 'doc') return renderNodes(node.content);
    return renderNodes(node.content);
  }

  function plainFromNodes(nodes) {
    if (!Array.isArray(nodes)) return '';
    return nodes.map(function (n) {
      if (!n) return '';
      if (n.type === 'text') return n.text || '';
      return plainFromNodes(n.content);
    }).join('');
  }

  function renderNodes(nodes) {
    if (!Array.isArray(nodes)) return '';
    return nodes.map(renderBlock).join('');
  }

  return renderBlock(doc.type === 'doc' ? doc : { type: 'doc', content: Array.isArray(doc) ? doc : [doc] });
}

function absolutizeImgSrc(html) {
  if (!html || html.indexOf('<img') < 0) return html;
  return html.replace(/<img\b([^>]*)>/gi, function (full, attrs) {
    var m = /\bsrc\s*=\s*(["'])([^"']*)\1/i.exec(attrs || '');
    if (!m) return full;
    var src = m[2];
    var abs = src;
    try {
      if (typeof springAuth.toAbsoluteMediaUrl === 'function') {
        abs = springAuth.toAbsoluteMediaUrl(src) || src;
      } else if (typeof springAuth.toAbsoluteApiUrl === 'function' && src.charAt(0) === '/') {
        abs = springAuth.toAbsoluteApiUrl(src) || src;
      }
    } catch (e) { /* keep src */ }
    var nextAttrs = String(attrs || '').replace(/\bsrc\s*=\s*(["'])[^"']*\1/i, 'src="' + abs.replace(/"/g, '&quot;') + '"');
    // 去掉可能导致 rich-text 失败的属性
    nextAttrs = nextAttrs
      .replace(/\b(on\w+|srcset|loading|decoding)\s*=\s*(["'])[^"']*\2/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return '<img ' + nextAttrs + ' />';
  });
}

/**
 * 收敛到 rich-text 较稳的子集：去 script/style/iframe，mark→strong，div→段落包裹。
 */
function adaptHtmlForRichText(html) {
  var s = String(html || '');
  if (!s) return '';
  s = s.replace(/<(script|style|iframe|object|embed|video|audio|form|input|button)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<(script|style|iframe|object|embed|video|audio|form|input|button)\b[^>]*\/?>/gi, '');
  s = s.replace(/<\/?mark\b[^>]*>/gi, function (tag) {
    return /^<\//.test(tag) ? '</strong>' : '<strong>';
  });
  // TipTap 空段
  s = s.replace(/<p(\s[^>]*)?>\s*(?:<br\s*\/?>|&nbsp;|\u00a0)?\s*<\/p>/gi, '<p><br/></p>');
  // 裸 div 包一层时尽量保留内文
  s = s.replace(/<div\b[^>]*>/gi, '<p>').replace(/<\/div>/gi, '</p>');
  // 连续 p 合并噪音
  s = s.replace(/(?:<\/p>\s*){2,}/gi, '</p>');
  s = absolutizeImgSrc(s);
  return s;
}

/**
 * @param {string|object} contentHtml 派生 HTML 或 { html }
 * @param {string|object} [contentJson] TipTap JSON（HTML 空时回退）
 * @returns {string} 可供 <rich-text type="html" nodes="..."> 使用的 HTML
 */
function preparePublishedContentHtml(contentHtml, contentJson) {
  var html = '';
  if (contentHtml != null && typeof contentHtml === 'object') {
    if (typeof contentHtml.html === 'string') html = contentHtml.html;
    else if (typeof contentHtml.content === 'string') html = contentHtml.content;
  } else if (contentHtml != null) {
    html = String(contentHtml);
  }
  html = decodeHtmlEntitiesIfNeeded(html).trim();
  if (!html && contentJson) {
    html = tipTapJsonToHtml(contentJson).trim();
  }
  if (!html) return '';
  if (html.indexOf('<') < 0) {
    html = '<p>' + escapeText(html).replace(/\r?\n/g, '<br/>') + '</p>';
  } else {
    html = adaptHtmlForRichText(html);
  }
  return typo.applyRichTextTypography(html);
}

module.exports = {
  preparePublishedContentHtml: preparePublishedContentHtml,
  tipTapJsonToHtml: tipTapJsonToHtml,
  adaptHtmlForRichText: adaptHtmlForRichText,
  decodeHtmlEntitiesIfNeeded: decodeHtmlEntitiesIfNeeded,
};
