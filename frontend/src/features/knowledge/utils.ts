/** Generate a URL-friendly slug from a title (Chinese → pinyin placeholder, English → lowercase) */
export function generateSlug(title: string): string {
  if (!title || !title.trim()) return 'untitled';
  const slug = title
    .trim()
    .replace(/[^a-zA-Z0-9一-龥]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug.toLowerCase() || 'untitled';
}

/** Extract a readable title from a filename (strip extensions and known suffixes) */
export function extractTitleFromFilename(filename: string): string {
  let name = filename.replace(/\.(md|txt)$/i, '');
  // Strip YUDAO suffix patterns
  name = name.replace(/[_—]\s*ruoyi-vue-pro\s*(开发|开发指南).*$/i, '');
  name = name.replace(/[_—]\s*开发指南.*$/i, '');
  // Strip date suffixes like (2024-01-01)
  name = name.replace(/\s*[\(\（]\d{4}-\d{2}-\d{2}[\)\）]\s*$/, '');
  return name.trim() || filename;
}

/** Format ISO date to Chinese display format (reuses existing formatter concept) */
export function formatKnowledgeDate(isoString: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  const y = d.getFullYear();
  const M = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${y}年${M}月${day}日 ${h}:${m}`;
}

/** Strip markdown syntax for plain-text preview */
export function stripMarkdownPreview(md: string, maxLen = 200): string {
  let text = md
    .replace(/^---[\s\S]*?---\n*/g, "")   // frontmatter
    .replace(/^#{1,6}\s+/gm, "")          // headings
    .replace(/\*\*([^*]+)\*\*/g, "$1")    // bold
    .replace(/\*([^*]+)\*/g, "$1")        // italic
    .replace(/`([^`]+)`/g, "$1")          // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/!\[.*?\]\([^)]+\)/g, "")    // images
    .replace(/^[-*•]\s+/gm, "")           // list markers
    .replace(/^\d+\.\s+/gm, "")           // ordered list
    .replace(/^>\s+/gm, "")               // blockquote
    .replace(/^\|.+\|$/gm, "")            // table rows
    .replace(/\n{2,}/g, " ")              // multiple newlines → space
    .replace(/\s+/g, " ")                 // whitespace collapse
    .trim();
  return text.length > maxLen ? text.substring(0, maxLen) + "..." : text;
}

/** Source label mapping */
export const SOURCE_LABELS: Record<string, string> = {
  imported: '导入',
  agent: 'Agent',
  manual: '人工',
};
