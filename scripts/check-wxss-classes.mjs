// scripts/check-wxss-classes.mjs
//
// 交叉比对小程序页面里 WXML 用到的 class 与 WXSS 定义的 class。
// 重构样式后最容易出的错是「类名打错 / 忘了定义」，WXSS 不会报错，样式静默失效。
//
// 用法: node scripts/check-wxss-classes.mjs aroapp/miniprogram/package-feature/pages/studentCageShelf
//
// 已知局限：只从 class 属性里的三元分支（`? 'x' : ''`）提取动态类名。
// `{{ a === 'b' ? ... }}` 里的 'b' 是比较值不是类名，故不提取——本仓库的弹窗里
// 动态类名都写成三元分支，够用。若将来出现数组拼接类名，需另加规则。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir || !existsSync(dir)) {
  console.error('用法: node scripts/check-wxss-classes.mjs <pageDir>');
  process.exit(2);
}

const read = (ext) => readdirSync(dir)
  .filter((f) => f.endsWith(ext))
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');

const wxml = read('.wxml');
const wxss = read('.wxss');

// ── WXML 侧：静态类名 + 三元分支里的字面量类名 + hover-class 等 ──
const used = new Set();
const push = (s) => { for (const c of String(s).split(/\s+/)) if (c) used.add(c); };

for (const m of wxml.matchAll(/class="([^"]*)"/g)) {
  const raw = m[1];
  for (const lit of raw.matchAll(/[?:]\s*'([^']*)'/g)) push(lit[1]); // 三元分支
  // 去掉 {{...}} 后会留下被插值截断的半截类名：`detail-save-msg--{{ type }}` → `detail-save-msg--`。
  // 以 '-' 结尾的 token 一律丢弃，否则会假报「未定义」。
  push(raw.replace(/\{\{[^}]*\}\}/g, ' ').split(/\s+/).filter((t) => t && !t.endsWith('-')).join(' '));
}
for (const m of wxml.matchAll(/(?:hover-class|close-icon-class|placeholder-class)="([^"{}]*)"/g)) push(m[1]);

// ── WXSS 侧：所有 .className 定义 ──
const defined = new Set();
for (const m of wxss.matchAll(/\.([A-Za-z_][\w-]*)/g)) defined.add(m[1]);

// van- / wx- / icon- 前缀是第三方或小程序内置，不要求本项目定义
const isExternal = (c) => /^(van-|wx-|icon-|van_)/.test(c);

const missing = [...used].filter((c) => !defined.has(c) && !isExternal(c)).sort();
const unused = [...defined].filter((c) => !used.has(c) && !isExternal(c)).sort();

console.log(`WXML 引用类 ${used.size} 个 · WXSS 定义类 ${defined.size} 个`);
console.log(`\n未被引用的 WXSS 类 ${unused.length} 个（死样式线索，不判失败）:`);
console.log(unused.join('  ') || '(无)');

if (missing.length) {
  console.error(`\n✗ WXML 用到但 WXSS 未定义 ${missing.length} 个:`);
  missing.forEach((c) => console.error('    ' + c));
  process.exit(1);
}
console.log('\n✓ WXML 引用的类均在 WXSS 中已定义');
