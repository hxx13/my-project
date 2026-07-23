/**
 * 与后端 AroNewsResponseParser 对齐：官方 CMS 编辑后字段/结构可能变化。
 */
const contentTransform = require('./aroNewsContentTransform.js');

const LIST_KEYS = ['list', 'records', 'rows', 'items', 'data'];
const TITLE_KEYS = ['newsName', 'title', 'name', 'newsTitle', 'subject'];
const ID_KEYS = ['id', 'newsId', 'news_id'];
const TIME_KEYS = ['createTime', 'create_time', 'gmtCreate', 'publishTime', 'publish_time', 'updateTime'];
const CONTENT_KEYS = [
  'newsContent',
  'news_content',
  'content',
  'newsContentHtml',
  'contentHtml',
  'html',
  'detail',
  'body',
  'newsDetail',
  'description',
  'text',
];

function stringifyContent(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw).trim();
  if (Array.isArray(raw)) {
    if (!raw.length) return '';
    return JSON.stringify(raw);
  }
  if (typeof raw === 'object') {
    for (let i = 0; i < CONTENT_KEYS.length; i++) {
      const k = CONTENT_KEYS[i];
      if (raw[k] != null) {
        const nested = stringifyContent(raw[k]);
        if (nested) return nested;
      }
    }
    for (let i = 0; i < ['html', 'content', 'text', 'value', 'body'].length; i++) {
      const k = ['html', 'content', 'text', 'value', 'body'][i];
      if (raw[k] != null) {
        const nested = stringifyContent(raw[k]);
        if (nested) return nested;
      }
    }
    return '';
  }
  return '';
}

function pickString(row, keys) {
  if (!row || typeof row !== 'object') return '';
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
    const s = stringifyContent(row[k]);
    if (s) return s;
  }
  return '';
}

function findListInObject(node) {
  if (Array.isArray(node)) return node;
  if (!node || typeof node !== 'object') return null;
  for (let i = 0; i < LIST_KEYS.length; i++) {
    const k = LIST_KEYS[i];
    const candidate = node[k];
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }
  return null;
}

function extractJtuListBody(body) {
  if (!body || typeof body !== 'object') return [];
  let raw = findListInObject(body.data);
  if (!raw) raw = findListInObject(body);
  return Array.isArray(raw) ? raw : [];
}

function normalizeSummaryRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    id: pickString(row, ID_KEYS) || row.id,
    newsName: pickString(row, TITLE_KEYS) || row.newsName,
    createTime: pickString(row, TIME_KEYS) || row.createTime,
  };
}

/** 详情 rich-text：返回 { newsContentNodes, newsContentIsArray } */
function normalizeDetailForDisplay(detail) {
  const base = detail && typeof detail === 'object' ? { ...detail } : {};
  base.id = pickString(base, ID_KEYS) || base.id;
  base.newsName = pickString(base, TITLE_KEYS) || base.newsName;
  base.createTime = pickString(base, TIME_KEYS) || base.createTime;
  let contentRaw = null;
  for (let i = 0; i < CONTENT_KEYS.length; i++) {
    const k = CONTENT_KEYS[i];
    if (base[k] != null && stringifyContent(base[k])) {
      contentRaw = base[k];
      break;
    }
  }
  let contentStr = stringifyContent(contentRaw != null ? contentRaw : base.newsContent);
  contentStr = contentTransform.forMiniProgramRichText(contentStr);
  let nodes = contentStr;
  let isArray = false;
  if (contentStr && (contentStr.startsWith('[') || contentStr.startsWith('{'))) {
    try {
      const parsed = JSON.parse(contentStr);
      if (Array.isArray(parsed)) {
        nodes = parsed;
        isArray = true;
      } else if (parsed && typeof parsed === 'object') {
        const html = parsed.html || parsed.content || parsed.text;
        if (html) nodes = String(html);
      }
    } catch (e) {
      /* 按 HTML 字符串展示 */
    }
  }
  base.newsContent = nodes;
  base.newsContentIsArray = isArray;
  return base;
}

function extractJtuDetailBody(body) {
  if (!body || typeof body !== 'object') return null;
  const data = body.data;
  if (Array.isArray(data)) return null;
  if (data && typeof data === 'object') {
    if (data.list) return null;
    return data;
  }
  return null;
}

function hasNewsHtmlContent(detail) {
  const n = normalizeDetailForDisplay(detail);
  if (n.newsContentIsArray && Array.isArray(n.newsContent)) {
    return n.newsContent.length > 0;
  }
  const html = n.newsContent != null ? String(n.newsContent).trim() : '';
  return html.length > 0;
}

module.exports = {
  extractJtuListBody,
  extractJtuDetailBody,
  normalizeSummaryRow,
  normalizeDetailForDisplay,
  hasNewsHtmlContent,
  pickString,
  CONTENT_KEYS,
};
