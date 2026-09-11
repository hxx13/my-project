// scripts/fix-tailwind-var-opacity.mjs
//
// 把「任意值 + 斜杠透明度」改成 color-mix 写法。
//
// 背景：Tailwind v3 对 `bg-[var(--x)]/25` 这种「任意值 + 斜杠透明度」**不生成任何规则**
// （实测 -c tailwind.config.js 编译结果为空）。而 tailwind-merge 仍把它当作合法的 bg-*
// 处理，会把基础变体的底色合并掉 —— 两者叠加的结果是该元素完全没有背景/边框/环。
// 全仓库 108 个文件命中这个写法，属于静默失效。
//
// 替换：
//   bg-[var(--app-color-accent)]/25
//     → bg-[color-mix(in_srgb,var(--app-color-accent)_25%,transparent)]
//   ring-[color:var(--admin-focus-ring)]/40
//     → ring-[color:color-mix(in_srgb,var(--admin-focus-ring)_40%,transparent)]
//
// 纯字符串替换，不改语义：同一个令牌、同一个百分比。
//
// 用法:
//   node scripts/fix-tailwind-var-opacity.mjs --dry
//   node scripts/fix-tailwind-var-opacity.mjs --apply
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'frontend', 'src');
const mode = process.argv[2];

if (!['--dry', '--apply'].includes(mode)) {
  console.error('用法: node scripts/fix-tailwind-var-opacity.mjs --dry|--apply');
  process.exit(2);
}

/** 颜色类工具前缀。带方向的（border-t/bg-x…）也要收 */
const UTIL = 'bg|text|border|ring|ring-offset|fill|stroke|from|to|via|divide|outline|decoration|caret|accent|placeholder';
const VAR = 'var\\(--[a-zA-Z0-9-]+\\)';

// 变体前缀（hover: / disabled: / focus-visible: / dark: / sm: / data-[state=open]: …）+ 工具类
const RE_PLAIN = new RegExp(`((?:[a-zA-Z0-9_\\-[\\]=]"'.:]*:)*)((?:${UTIL})(?:-[trblxyse])?)-\\[(${VAR})\\]\\/(\\d+)`, 'g');
// 显式 color: 提示的写法（ring-[color:var(--x)]/40）
const RE_COLOR_HINT = new RegExp(`-\\[color:(${VAR})\\]\\/(\\d+)`, 'g');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

let filesTouched = 0;
let totalHits = 0;
const samples = [];

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  let hits = 0;

  const next = src
    // 先处理 color: 提示的写法，避免被通用规则切一半
    .replace(RE_COLOR_HINT, (_m, v, a) => {
      hits++;
      return `-[color:color-mix(in_srgb,${v}_${a}%,transparent)]`;
    })
    .replace(RE_PLAIN, (_m, variant, util, v, a) => {
      // 已经是 color-mix 的不要再套一层
      if (v.includes('color-mix')) return _m;
      hits++;
      return `${variant}${util}-[color-mix(in_srgb,${v}_${a}%,transparent)]`;
    });

  if (hits === 0) continue;
  filesTouched++;
  totalHits += hits;
  if (samples.length < 6) {
    const before = src.match(/[\w:[\].-]*\[var\(--[\w-]+\)\]\/\d+/)?.[0];
    const after = next.match(/[\w:[\].-]*\[color:color-mix[^\]]*\]/)?.[0];
    samples.push(`${relative(ROOT, file)}\n    ${before}\n → ${after}`);
  }
  if (mode === '--apply') writeFileSync(file, next, 'utf8');
}

console.log(`${mode === '--apply' ? '已改写' : '将改写'} ${filesTouched} 个文件，共 ${totalHits} 处`);
if (samples.length) console.log('\n样例:\n' + samples.map((s) => '  ' + s).join('\n'));
