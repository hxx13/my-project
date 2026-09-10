// scripts/check-changetype-coverage.mjs
//
// 审计 changeType 的中文映射覆盖检查。
// 背景：小程序记录弹窗把后端原始枚举（UPDATE/TRANSFER/RELEASE…）翻成中文展示，
// 后端新增一个 changeType 而前端忘了补映射时，界面会直接显示英文枚举，不报错、不崩溃，
// 只能靠肉眼发现。这个脚本把「后端调用点的字面量」与「前端映射表」对起来。
//
// 用法: node scripts/check-changetype-coverage.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const JAVA_ROOT = join(ROOT, 'src', 'main', 'java');
const MAP_FILE = join(
  ROOT, 'aroapp', 'miniprogram', 'package-feature', 'pages', 'studentCageShelf', 'index.js',
);

/** 递归收集 .java 文件 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.java')) out.push(p);
  }
  return out;
}

// 只关心 DATA 类别（cageHistory 读的就是 CATEGORY_DATA）。
// logDictChange 是码表/字段字典的审计，不会出现在笼位历史里。
const WRITE_RE = /logData(?:Change|Json)\(\s*"([A-Z_]+)"/g;

const written = new Set();
for (const file of walk(JAVA_ROOT)) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(WRITE_RE)) written.add(m[1]);
}

// 后端预留的迁移类枚举（CageFormAuditService 的 IN_TYPES/OUT_TYPES），不在调用点字面量里但会入库
const SERVICE = readFileSync(
  walk(JAVA_ROOT).find((f) => f.endsWith('CageFormAuditService.java')), 'utf8',
);
for (const m of SERVICE.matchAll(/Set\.of\(([^)]*)\)/g)) {
  for (const lit of m[1].matchAll(/"([A-Z_]+)"/g)) written.add(lit[1]);
}

// 前端映射表：抓 CHANGE_TYPE_LABEL 对象体里的 key
const js = readFileSync(MAP_FILE, 'utf8');
const body = js.match(/var CHANGE_TYPE_LABEL = \{([\s\S]*?)\n\};/);
if (!body) {
  console.error('✗ 在 index.js 里找不到 CHANGE_TYPE_LABEL 定义');
  process.exit(2);
}
const mapped = new Set([...body[1].matchAll(/^\s*([A-Z_]+):/gm)].map((m) => m[1]));

const missing = [...written].filter((t) => !mapped.has(t)).sort();
const extra = [...mapped].filter((t) => !written.has(t)).sort();

console.log(`后端 DATA 类 changeType ${written.size} 个 · 前端已映射 ${mapped.size} 个`);
if (extra.length) console.log(`\nℹ 前端多出（后端当前未写入，可能是预留或历史遗留）: ${extra.join(', ')}`);

if (missing.length) {
  console.error(`\n✗ 后端会写入但前端没有中文映射 ${missing.length} 个（界面会显示英文枚举）:`);
  missing.forEach((t) => console.error('    ' + t));
  process.exit(1);
}
console.log('\n✓ 后端所有 DATA 类 changeType 都有中文映射');
