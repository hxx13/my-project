/**
 * QOWT / Google Docs 导出 HTML：转为小程序 rich-text 可渲染的 p/strong/br，且只取最内层段落避免重复。
 */

function needsRichTextSanitize(html) {
  if (!html || typeof html !== 'string') return false;
  return /qowt-|style-scope|is=["']qowt|<qowt/i.test(html);
}

function escapeMinimal(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function hasBoldStlClass(className) {
  if (!className) return false;
  const c = String(className);
  return /qowt-stl-[234]\b/.test(c);
}

function extractClass(tagOpen) {
  const m = /class=["']([^"']*)["']/i.exec(tagOpen || '');
  return m ? m[1] : '';
}

function stripTags(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

/** 解析最内层 <p>…</p>，含 is="qowt-word-para" */
function collectLeafParagraphs(html) {
  const paras = [];
  const re = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const block = m[0];
    const open = block.slice(0, block.indexOf('>') + 1);
    const innerFrom = open.length;
    const inner = block.slice(innerFrom, block.length - 4);
    if (/<p\b/i.test(inner)) continue;
    paras.push({ open, inner });
  }
  return paras;
}

function renderInline(inner) {
  let out = '';
  const re = /(<br\s*\/?>)|(<span\b[^>]*>[\s\S]*?<\/span>)|(<b\b[^>]*>[\s\S]*?<\/b>)|(<strong\b[^>]*>[\s\S]*?<\/strong>)/gi;
  let last = 0;
  let m;
  while ((m = re.exec(inner)) !== null) {
    if (m.index > last) {
      out += escapeMinimal(inner.slice(last, m.index));
    }
    const token = m[0];
    if (/^<br/i.test(token)) {
      out += '<br/>';
    } else {
      const open = token.slice(0, token.indexOf('>') + 1);
      const body = token.slice(open.length, token.lastIndexOf('<'));
      const cls = extractClass(open);
      const rendered = renderInline(body);
      if (rendered && (hasBoldStlClass(cls) || /^<(?:b|strong)\b/i.test(open))) {
        out += rendered.startsWith('<strong>') ? rendered : `<strong>${rendered}</strong>`;
      } else {
        out += rendered;
      }
    }
    last = m.index + token.length;
  }
  if (last < inner.length) {
    out += escapeMinimal(inner.slice(last));
  }
  if (!out && inner.trim()) {
    out = escapeMinimal(stripTags(inner));
  }
  return out.trim();
}

function renderParagraph(open, inner) {
  const inline = renderInline(inner);
  if (!inline) return '';
  const cls = extractClass(open);
  if (hasBoldStlClass(cls)) {
    if (inline.startsWith('<strong>') && inline.endsWith('</strong>')) {
      return `<p>${inline}</p>`;
    }
    return `<p><strong>${inline}</strong></p>`;
  }
  return `<p>${inline}</p>`;
}

function forMiniProgramRichText(raw) {
  if (raw == null) return '';
  const html = String(raw).trim();
  if (!html) return '';
  if (!needsRichTextSanitize(html)) return html;

  const leafs = collectLeafParagraphs(html);
  if (!leafs.length) {
    const text = stripTags(html);
    return text ? `<p>${escapeMinimal(text)}</p>` : '';
  }

  const seen = new Set();
  const parts = [];
  leafs.forEach(({ open, inner }) => {
    const rendered = renderParagraph(open, inner);
    if (!rendered) return;
    const key = stripTags(inner).replace(/\s+/g, ' ').trim();
    if (key) {
      if (seen.has(key)) return;
      seen.add(key);
    }
    parts.push(rendered);
  });
  return parts.join('');
}

module.exports = {
  needsRichTextSanitize,
  forMiniProgramRichText,
};
