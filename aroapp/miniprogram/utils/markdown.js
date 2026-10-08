/**
 * 轻量 Markdown → HTML 转换器
 * 输出带内联排版的语义 HTML，供 <rich-text type="html"> 渲染
 */
const typo = require('./richTextTypography.js');

/**
 * 解析内联格式：**加粗** *斜体* `代码` [链接](url) ![图片](url)
 */
function parseInline(line) {
  if (!line) return '';
  let s = line;
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (_m, alt, url) {
    return '<img src="' + url + '" alt="' + alt + '" style="' + typo.tagStyle('img') + '"/>';
  });
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_m, text, url) {
    return '<a href="' + url + '" style="' + typo.tagStyle('a') + '">' + text + '</a>';
  });
  s = s.replace(/\*\*(.+?)\*\*/g, function (_m, text) {
    return typo.styledOpenTag('strong') + text + '</strong>';
  });
  s = s.replace(/\*([^*]+)\*/g, function (_m, text) {
    return typo.styledOpenTag('em') + text + '</em>';
  });
  s = s.replace(/`([^`]+)`/g, function (_m, text) {
    return typo.styledOpenTag('code') + text + '</code>';
  });
  return s;
}

/**
 * 表格分隔行：| --- | :-: | ---: |
 */
function isTableDivider(line) {
  return /\|/.test(line) && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

/** 拆一行表格单元格：去掉首尾竖线再按 | 切 */
function splitTableRow(line) {
  var s = String(line).trim();
  if (s.charAt(0) === '|') s = s.slice(1);
  if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
  return s.split('|').map(function (c) {
    return c.trim();
  });
}

/**
 * 主转换函数：Markdown 字符串 → HTML 字符串
 */
function mdToHtml(md) {
  if (!md || typeof md !== 'string') return '';
  const lines = md.split('\n');
  const out = [];
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false; }
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      out.push('<br/>');
      continue;
    }

    /* 表格：本行含 | 且下一行是分隔行。
       必须在标题/段落之前判，否则 "| a | b |" 会被当成普通段落。 */
    if (trimmed.indexOf('|') >= 0 && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false; }
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }

      const header = splitTableRow(trimmed);
      i += 2; // 跳过表头行与分隔行
      const bodyRows = [];
      while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0) {
        bodyRows.push(splitTableRow(lines[i]));
        i += 1;
      }
      i -= 1; // 抵消 for 的 i++

      let table = '<table style="' + typo.tagStyle('table') + '"><thead><tr>';
      header.forEach((h) => {
        table += '<th style="' + typo.tagStyle('th') + '">' + parseInline(h) + '</th>';
      });
      table += '</tr></thead><tbody>';
      bodyRows.forEach((row) => {
        table += '<tr>';
        header.forEach((_h, ci) => {
          table += '<td style="' + typo.tagStyle('td') + '">' + parseInline(row[ci] || '') + '</td>';
        });
        table += '</tr>';
      });
      table += '</tbody></table>';
      out.push(table);
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inBlockquote) { out.push(typo.styledOpenTag('blockquote')); inBlockquote = true; }
      const content = trimmed.replace(/^>\s?/, '');
      out.push(typo.styledTag('p', parseInline(content)));
      continue;
    }
    if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false; }

    if (/^\-{3,}$/.test(trimmed)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      out.push('<hr style="' + typo.tagStyle('hr') + '"/>');
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      const level = hMatch[1].length;
      out.push(typo.styledTag('h' + level, parseInline(hMatch[2])));
      continue;
    }

    const ulMatch = trimmed.match(/^[\-\*]\s+(.+)/);
    if (ulMatch) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push(typo.styledOpenTag('ul')); inUl = true; }
      out.push(typo.styledTag('li', parseInline(ulMatch[1])));
      continue;
    }

    const olMatch = trimmed.match(/^\d+[\.\)]\s+(.+)/);
    if (olMatch) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push(typo.styledOpenTag('ol')); inOl = true; }
      out.push(typo.styledTag('li', parseInline(olMatch[1])));
      continue;
    }

    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
    out.push(typo.styledTag('p', parseInline(trimmed)));
  }

  if (inBlockquote) out.push('</blockquote>');
  if (inUl) out.push('</ul>');
  if (inOl) out.push('</ol>');

  return out.join('');
}

/**
 * HTML → Markdown 反向转换（用于编辑已有公告时回填编辑器）
 *
 * WARNING: 本函数是轻量级正则替换，存在已知局限：
 * - 不支持表格 (<table>) 的转换
 * - 不支持 <pre>/<code> 代码块的还原
 * - 不支持嵌套列表的精确层级重建
 * - 带内联样式的标签在编辑后重新保存不会丢失正文，但会重新生成排版 style
 */
function htmlToMd(html) {
  if (!html || typeof html !== 'string') return '';
  let s = html;
  s = s.replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '\n');
  s = s.replace(/<div[^>]*>/gi, '').replace(/<\/div>/gi, '\n');
  s = s.replace(/<span[^>]*>/gi, '').replace(/<\/span>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<h1[^>]*>/gi, '# ').replace(/<\/h1>/gi, '\n');
  s = s.replace(/<h2[^>]*>/gi, '## ').replace(/<\/h2>/gi, '\n');
  s = s.replace(/<h3[^>]*>/gi, '### ').replace(/<\/h3>/gi, '\n');
  s = s.replace(/<strong[^>]*>/gi, '**').replace(/<\/strong>/gi, '**');
  s = s.replace(/<em[^>]*>/gi, '*').replace(/<\/em>/gi, '*');
  s = s.replace(/<code[^>]*>/gi, '`').replace(/<\/code>/gi, '`');
  s = s.replace(/<ul[^>]*>/gi, '').replace(/<\/ul>/gi, '');
  s = s.replace(/<li[^>]*>/gi, '- ').replace(/<\/li>/gi, '\n');
  s = s.replace(/<ol[^>]*>/gi, '').replace(/<\/ol>/gi, '');
  s = s.replace(/<blockquote[^>]*>/gi, '').replace(/<\/blockquote>/gi, '');
  s = s.replace(/<hr\s*\/?>/gi, '---\n');
  s = s.replace(/<a\s+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '[$2]($1)');
  s = s.replace(/<img\s+src="([^"]*)"[^>]*\/?>/gi, '![]($1)');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

module.exports = {
  mdToHtml,
  htmlToMd,
};
