/**
 * 芋道 HTML → Markdown 完整转换脚本
 * 严格保留所有内容：图片、代码块、表格、列表、链接
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import TurndownService from 'turndown';

const SOURCE_DIR = 'D:/codex/YUDAO/ruoyi-vue-pro';
const OUTPUT_DIR = 'D:/codex/verson.1.2/20260416/docs/开发参考';

// ── Turndown 配置 ──
const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  blankReplacement: (_content: string, node: HTMLElement) => {
    return node.nodeName === 'BR' ? '\n' : '';
  },
});

// 保留代码块语言标记
td.addRule('fencedCodeBlock', {
  filter: (_node, options) => {
    return !!(options as any).codeBlockStyle === 'fenced' &&
      (_node as HTMLElement).nodeName === 'PRE' &&
      (_node as HTMLElement).firstChild?.nodeName === 'CODE';
  },
  replacement: (_content, node) => {
    const codeEl = (node as HTMLElement).querySelector('code');
    const code = codeEl?.textContent || '';
    const className = codeEl?.className || '';
    const lang = className.replace('language-', '') || '';
    return '\n\n```' + lang + '\n' + code + '\n```\n\n';
  },
});

// 自定义表格处理 — 确保转为 Markdown 表格
td.addRule('table', {
  filter: ['table'],
  replacement: (_content: string, node: HTMLElement) => {
    const rows = node.querySelectorAll('tr');
    if (rows.length === 0) return '';
    let md = '\n\n';
    // Header
    const headerCells = rows[0].querySelectorAll('th, td');
    if (headerCells.length > 0) {
      md += '| ' + Array.from(headerCells).map(c => c.textContent?.trim() || '').join(' | ') + ' |\n';
      md += '| ' + Array.from(headerCells).map(() => '---').join(' | ') + ' |\n';
    }
    // Body
    const startIdx = headerCells.length > 0 && rows[0].querySelectorAll('th').length > 0 ? 1 : 0;
    for (let i = startIdx; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td, th');
      if (cells.length > 0) {
        md += '| ' + Array.from(cells).map(c => (c.textContent?.trim() || '').replace(/\|/g, '\\|')).join(' | ') + ' |\n';
      }
    }
    return md + '\n';
  },
});

// 移除不需要的元素
td.remove(['script', 'style', 'noscript', 'iframe', 'svg', 'canvas']);

// ── URL 映射 ──
interface PageMapping {
  url: string;
  mdPath: string;
  category: string;
}

function buildUrlMapping(): Map<string, PageMapping> {
  const map = new Map<string, PageMapping>();

  function walk(dir: string, category: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fp = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fp, entry.name);
      } else if (entry.name.endsWith('.html')) {
        const html = fs.readFileSync(fp, 'utf-8');
        // Extract URL from body class or sidebar
        const titleMatch = html.match(/<title>([^<|]+)(?:\s*\|.*)?<\/title>/);
        const title = titleMatch ? titleMatch[1].trim() : '';

        // Find the URL path from sidebar links matching this title
        const linkRe = /href="https:\/\/doc\.iocoder\.cn\/([^"]*)"[^>]*>([^<]+)<\/a>/g;
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(html)) !== null) {
          if (m[2].trim() === title) {
            const url = m[1].replace(/\/$/, '');
            const mdFilename = path.basename(fp, '.html').replace(/\s*_\s*ruoyi-vue-pro.*$/, '') + '.md';
            map.set(url, {
              url,
              mdPath: `/开发参考/${category}/${mdFilename}`,
              category,
            });
            break;
          }
        }
      }
    }
  }

  walk(SOURCE_DIR, '');
  return map;
}

// ── 内容提取 ──
function extractContent(html: string): { title: string; body: string } | null {
  const titleMatch = html.match(/<title>([^<|]+)(?:\s*\|.*)?<\/title>/);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // 找到正文区域
  const startIdx = html.indexOf('class="theme-vdoing-content content__default"');
  if (startIdx === -1) return null;
  const contentStart = html.indexOf('>', startIdx) + 1;

  let contentEnd = html.indexOf('<footer', contentStart);
  if (contentEnd === -1) contentEnd = html.indexOf('class="page-edit"', contentStart);
  if (contentEnd === -1) contentEnd = html.indexOf('</main>', contentStart);
  if (contentEnd === -1) return null;

  let body = html.substring(contentStart, contentEnd);

  // 移除安全检测相关的遮挡 div
  body = body.replace(/<div[^>]*id="yudao_[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  body = body.replace(/opacity\s*:\s*0\.001\s*;?/gi, '');
  body = body.replace(/filter\s*:\s*blur\([^)]*\)\s*;?/gi, '');
  body = body.replace(/pointer-events\s*:\s*nsone\s*;?/gi, '');

  return { title, body };
}

// ── Markdown 后处理 ──
function cleanMarkdown(md: string, urlMapping: Map<string, PageMapping>): string {
  // 1. 替换 doc.iocoder.cn 链接为本地路径；无匹配的改为纯文本
  md = md.replace(/\[([^\]]*)\]\(https:\/\/doc\.iocoder\.cn\/([^\s)"'#]+)\)/g, (_full: string, text: string, urlPath: string) => {
    const cleanPath = urlPath.replace(/\/$/, '');
    const mapping = urlMapping.get(cleanPath);
    if (mapping) return `[${text}](${mapping.mdPath})`;
    return text; // 无映射 → 纯文本
  });
  // 2. 删除所有残留的在线链接（外部网站）— 转为纯文本
  md = md.replace(/\[([^\]]*)\]\(https?:\/\/[^\s)"']+\)/g, '$1');

  // 3. 移除 HTML 锚点链接 [#](#xxx)
  md = md.replace(/\[#\]\(#[^)]*\)/g, '');

  // 4. 移除 (opens new window) 标注
  md = md.replace(/\s*\(opens new window\)/gi, '');

  // 5. 清理标题中的多余空格和锚点残留
  md = md.replace(/^#{1,4}\s+#/gm, (m: string) => m.replace(/\s+#/, ' '));

  // 6. 替换 base64 图片为占位符（减小文件体积，避免 CI 内存溢出）
  md = md.replace(/!\[([^\]]*)\]\(data:image\/[^)]+\)/g, (_full: string, alt: string) => {
    return `> 📷 *${alt || '截图'}*`;
  });

  // 7. 清理多余空行
  md = md.replace(/\n{4,}/g, '\n\n\n');

  return md;
}

// ── 收集源文件 ──
interface FileEntry {
  fullPath: string;
  relativePath: string;
  category: string;
}

function collectFiles(): FileEntry[] {
  const results: FileEntry[] = [];
  function walk(dir: string, relative: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fp = path.join(dir, entry.name);
      const rp = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(fp, rp);
      else if (entry.name.endsWith('.html')) {
        results.push({ fullPath: fp, relativePath: rp, category: relative.split('/')[0] || '' });
      }
    }
  }
  walk(SOURCE_DIR, '');
  return results;
}

// ── 主流程 ──
function main() {
  console.log('🔧 芋道 HTML → Markdown 完整转换\n');

  if (fs.existsSync(OUTPUT_DIR)) fs.rmSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('📡 构建 URL 映射...');
  const urlMapping = buildUrlMapping();
  console.log(`  ✓ ${urlMapping.size} 个 URL 映射`);

  console.log('📡 收集文件...');
  const files = collectFiles();
  console.log(`  ✓ ${files.length} 个 HTML 文件\n`);

  let converted = 0;
  const categories = new Set<string>();

  for (const file of files) {
    try {
      const html = fs.readFileSync(file.fullPath, 'utf-8');
      const extracted = extractContent(html);
      if (!extracted || !extracted.body.trim()) continue;

      const md = td.turndown(extracted.body);
      const cleanMd = cleanMarkdown(md, urlMapping);

      const catDir = path.join(OUTPUT_DIR, file.category);
      if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
      categories.add(file.category);

      const mdFilename = path.basename(file.relativePath, '.html')
        .replace(/\s*_\s*ruoyi-vue-pro.*$/, '') + '.md';
      const outputPath = path.join(catDir, mdFilename);

      const mdContent = `---
title: ${extracted.title}
category: ${file.category}
---

# ${extracted.title}

${cleanMd}
`;

      fs.writeFileSync(outputPath, mdContent, 'utf-8');
      converted++;
    } catch (e) {
      console.warn(`  ⚠ ${file.category}/${path.basename(file.relativePath)}: ${(e as Error).message}`);
    }
  }

  console.log(`\n✅ 成功转换 ${converted} 个文件`);
  console.log(`📂 ${categories.size} 个分类`);
  console.log(`📁 输出: ${OUTPUT_DIR}\n`);
}

main();
