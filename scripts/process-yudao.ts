/**
 * 芋道源码 HTML 本地化处理脚本 v2
 *
 * 策略：
 * 1. 从文件名提取页面标题 → 在 sidebar 中匹配 → 得到 URL 路径
 * 2. 构建 URL → 本地文件映射
 * 3. 替换所有 doc.iocoder.cn 链接为本地相对路径
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const SOURCE_DIR = 'D:/codex/YUDAO/ruoyi-vue-pro';
const OUTPUT_DIR = 'D:/codex/verson.1.2/20260416/docs/public/yudao';
const ONLINE_BASE = 'https://doc.iocoder.cn';

// ── Step 1: 构建 URL → 本地文件映射 ──

interface FileInfo {
  fullPath: string;
  relativePath: string;
  title: string;       // from filename
  urlPath: string;     // matched from sidebar
}

function buildMapping(): Map<string, FileInfo> {
  const urlToFile = new Map<string, FileInfo>();
  const files = collectAllFiles(SOURCE_DIR);

  // 先收集所有文件
  for (const file of files) {
    const content = fs.readFileSync(file.fullPath, 'utf-8');
    const title = extractTitleFromFilename(file.relativePath);

    // 在 sidebar HTML 中找匹配此标题的链接 URL
    const urlPath = findUrlByTitle(content, title);

    if (urlPath) {
      file.title = title;
      file.urlPath = urlPath;
      const cleanUrl = urlPath.replace(/\/$/, '') || '/';
      if (!urlToFile.has(cleanUrl)) {
        urlToFile.set(cleanUrl, file);
      }
    }
  }

  return urlToFile;
}

function collectAllFiles(dir: string): FileInfo[] {
  const results: FileInfo[] = [];

  function walk(currentDir: string, relativeDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.name.endsWith('.html') || entry.name.endsWith('.htm')) {
        results.push({ fullPath, relativePath: relPath, title: '', urlPath: '' });
      }
    }
  }

  walk(dir, '');
  return results;
}

function extractTitleFromFilename(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath));
  // "新建模块 _ ruoyi-vue-pro 开发指南 (2026_06_05 09_51_15)" → "新建模块"
  const title = basename
    .replace(/\s*_\s*ruoyi-vue-pro.*$/i, '')
    .replace(/\s*\(\d{4}_\d{2}_\d{2}.*$/, '')
    .trim();
  return title;
}

function findUrlByTitle(content: string, title: string): string | null {
  // 构建 sidebar 的文本→URL 映射
  // 匹配模式: href="https://doc.iocoder.cn/XXX"[...]>TEXT</a>
  const linkPattern = /href="https:\/\/doc\.iocoder\.cn\/([^"]*)"[^>]*>([^<]+)<\/a>/g;
  let match: RegExpExecArray | null;

  // 先收集所有 sidebar 链接
  const sidebarLinks: Array<{ url: string; text: string }> = [];
  while ((match = linkPattern.exec(content)) !== null) {
    const url = match[1];
    const text = match[2].trim();
    if (text && !text.startsWith('<') && text.length < 100) {
      sidebarLinks.push({ url, text });
    }
  }

  // 精确匹配标题
  for (const link of sidebarLinks) {
    if (link.text === title) {
      return link.url;
    }
  }

  // 模糊匹配：标题包含在 link text 中，或 link text 包含在标题中
  for (const link of sidebarLinks) {
    if (link.text.includes(title) || title.includes(link.text)) {
      return link.url;
    }
  }

  // 尝试用内容中的 <title> 标签再次匹配
  const titleMatch = content.match(/<title>([^<|]+)(?:\s*\|.*)?<\/title>/);
  if (titleMatch) {
    const htmlTitle = titleMatch[1].trim();
    for (const link of sidebarLinks) {
      if (link.text === htmlTitle || htmlTitle.includes(link.text) || link.text.includes(htmlTitle)) {
        return link.url;
      }
    }
  }

  return null;
}

// ── Step 2: 处理文件并替换链接 ──

function processFiles(urlToFile: Map<string, FileInfo>) {
  console.log(`\n📊 已映射: ${urlToFile.size} 个页面\n`);

  // 清空输出
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }

  let copiedCount = 0;
  let replacedLinks = 0;

  // 遍历所有源文件，复制并替换
  for (const [url, fileInfo] of urlToFile) {
    const srcPath = fileInfo.fullPath;

    // 构建输出路径：基于 URL 路径
    const outputPath = buildOutputPath(url, fileInfo);
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    let content = fs.readFileSync(srcPath, 'utf-8');

    // 剥离所有脚本和 Vue 框架依赖，只保留纯 HTML+CSS
    content = stripScripts(content);

    // 替换所有 doc.iocoder.cn 链接为本地路径
    let fileReplaceCount = 0;
    content = content.replace(
      /href="https:\/\/doc\.iocoder\.cn\/([^"#]*)(#[^"]*)?"/g,
      (fullMatch: string, urlPath: string, hash: string) => {
        const cleanUrl = (urlPath || '').replace(/\/$/, '') || '/';
        const targetFile = urlToFile.get(cleanUrl);

        if (targetFile) {
          fileReplaceCount++;
          const targetOutputPath = buildOutputPath(cleanUrl, targetFile);
          let rel = path.relative(outputDir, targetOutputPath).replace(/\\/g, '/');
          const hashPart = hash || '';
          return `href="${rel}${hashPart}"`;
        }

        // 未找到映射，保持在线链接
        return `href="${ONLINE_BASE}/${cleanUrl}${hash || ''}"`;
      }
    );

    fs.writeFileSync(outputPath, content, 'utf-8');
    copiedCount++;
    replacedLinks += fileReplaceCount;
  }

  // 复制未被映射的文件（如可能存在的图片、CSS等）
  copyNonHtmlFiles();

  console.log(`  ✓ ${copiedCount} 个文件已处理`);
  console.log(`  ✓ ${replacedLinks} 个链接已替换为本地路径`);

  // 生成导航首页
  generateIndexPage(urlToFile);
}

function buildOutputPath(url: string, fileInfo: FileInfo): string {
  // 用 URL 路径作为目录结构
  const urlClean = url.replace(/\/$/, '') || 'index';

  // 保留原始手册分类（从文件路径中提取第一级目录）
  const parts = fileInfo.relativePath.split('/');
  const category = parts.length > 1 ? parts[0] : '';

  // URL 的最后一段作为文件名
  const urlSegments = urlClean.split('/');
  const lastSegment = urlSegments[urlSegments.length - 1] || 'index';

  if (category && urlClean !== 'index') {
    return path.join(OUTPUT_DIR, category, `${lastSegment}.html`);
  }
  return path.join(OUTPUT_DIR, `${lastSegment}.html`);
}

function copyNonHtmlFiles() {
  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (!entry.name.endsWith('.html') && !entry.name.endsWith('.htm')) {
        const relPath = path.relative(SOURCE_DIR, fullPath);
        const destPath = path.join(OUTPUT_DIR, relPath);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(fullPath, destPath);
      }
    }
  }
  if (fs.existsSync(SOURCE_DIR)) walk(SOURCE_DIR);
}

/** 剥离安全检测、脚本、模糊覆盖层 */
function stripScripts(html: string): string {
  // 1. 移除芋道安全检测覆盖层 div（文档安全环境检测中...）
  html = html.replace(/<div[^>]*id="yudao_[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  // 2. 移除所有 <script>...</script> 标签
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // 3. 恢复内容可见性：针对 style 属性中的遮盖样式
  html = html.replace(/style="([^"]*)"/gi, (_m: string, styles: string) => {
    let cleaned = styles
      .replace(/opacity\s*:\s*0\.001\s*;?\s*/gi, '')
      .replace(/filter\s*:\s*blur\s*\([^)]*\)\s*;?\s*/gi, '')
      .replace(/pointer-events\s*:\s*none\s*;?\s*/gi, '')
      .replace(/user-select\s*:\s*none\s*;?\s*/gi, '')
      .replace(/max-height\s*:\s*100vh\s*;?\s*/gi, '')
      .trim();
    return cleaned ? `style="${cleaned}"` : '';
  });
  // 也处理非 style 属性内联的遮盖（如 CSS 中）
  html = html.replace(/opacity\s*:\s*0\.001\s*!?\s*important\s*;?\s*/gi, '');
  html = html.replace(/filter\s*:\s*blur\s*\([^)]*\)\s*!?\s*important\s*;?\s*/gi, '');
  html = html.replace(/pointer-events\s*:\s*none\s*!?\s*important\s*;?\s*/gi, '');
  // 4. 移除 <link> 的 modulepreload 和 script-like 引用
  html = html.replace(/<link[^>]*rel="modulepreload"[^>]*\/?>/gi, '');
  html = html.replace(/<link[^>]*\sas="script"[^>]*\/?>/gi, '');
  // 5. 移除内联事件处理器（onclick, onload 等）
  html = html.replace(/\son\w+="[^"]*"/gi, '');
  // 6. 移除 <noscript> 标签
  html = html.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
  // 7. 溢出改为可见
  html = html.replace(/overflow\s*:\s*hidden\s*;?\s*/gi, 'overflow: auto;');
  return html;
}

// ── Step 3: 生成导航首页 ──

function generateIndexPage(urlToFile: Map<string, FileInfo>) {
  // 按类别分组
  const groups = new Map<string, Array<{ title: string; url: string; filePath: string }>>();

  for (const [url, info] of urlToFile) {
    const parts = info.relativePath.split('/');
    const group = parts.length > 1 ? parts[0] : '其他';
    if (!groups.has(group)) groups.set(group, []);

    const outputPath = buildOutputPath(url, info);
    const relToRoot = path.relative(OUTPUT_DIR, outputPath).replace(/\\/g, '/');
    groups.get(group)!.push({
      title: info.title || url.split('/').pop() || url,
      url,
      filePath: relToRoot,
    });
  }

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>芋道源码 ruoyi-vue-pro 开发指南（本地镜像）</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #f0f2f5; color: #333; }
  .header { background: linear-gradient(135deg, #1a73e8, #0d47a1); color: #fff; padding: 32px 24px; text-align: center; }
  .header h1 { font-size: 22px; margin-bottom: 8px; }
  .header p { font-size: 13px; opacity: .8; }
  .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 10px 16px; margin: 12px 20px; border-radius: 6px; font-size: 12px; text-align: center; }
  .container { max-width: 1100px; margin: 0 auto; padding: 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
  .card { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .card h2 { font-size: 15px; color: #1a73e8; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0; }
  .card ul { list-style: none; }
  .card li { margin: 3px 0; }
  .card a { color: #555; text-decoration: none; font-size: 13px; display: block; padding: 3px 6px; border-radius: 4px; }
  .card a:hover { background: #e8f0fe; color: #1a73e8; }
  .footer { text-align: center; padding: 24px; color: #999; font-size: 12px; }
</style>
</head>
<body>
<div class="header">
  <h1>📚 芋道源码 ruoyi-vue-pro 开发指南</h1>
  <p>本地镜像 · ${urlToFile.size} 个页面</p>
</div>
<div class="warning">⚠️ 会员内容，仅供个人学习参考，请勿公开传播</div>
<div class="container">
`;

  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh'));
  for (const [groupName, items] of sortedGroups) {
    items.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
    html += `<div class="card"><h2>${groupName}</h2><ul>`;
    for (const item of items) {
      html += `<li><a href="${item.filePath}">${item.title}</a></li>`;
    }
    html += '</ul></div>';
  }

  html += `</div>
<div class="footer">TwinSystem 设计档案 · 本地学习镜像</div>
</body></html>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html, 'utf-8');
}

// ── Main ──

console.log('🔧 芋道源码 HTML 本地化处理 v2\n');

console.log('📡 扫描文件并提取 URL 映射...');
const urlToFile = buildMapping();

console.log(`  ✓ 共发现 ${urlToFile.size} 个可映射页面`);

// 列出所有映射
const mappedList = [...urlToFile.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]));
for (const [url, info] of mappedList.slice(0, 10)) {
  console.log(`    ${url} ← ${info.title}`);
}
if (mappedList.length > 10) {
  console.log(`    ... 共 ${mappedList.length} 条`);
}

console.log('\n📝 处理并复制文件...');
processFiles(urlToFile);

console.log('\n✅ 完成！输出目录:', OUTPUT_DIR);
