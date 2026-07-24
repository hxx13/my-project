/**
 * 每次构建前，从 aroapp/miniprogram/pages/assets/images/ 拷贝图标到 frontend/public/
 * 确保前端 /mobile-student-icons/*.png 和 /images/logohs.png 始终与小程序端同步
 */
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'aroapp/miniprogram/pages/assets/images');
const PUBLIC = resolve(ROOT, 'frontend/public');

const TASKS = [
  // [源文件名, 目标子目录]
  ['icon-room.png',      'mobile-student-icons'],
  ['icon-supplies.png',  'mobile-student-icons'],
  ['icon-cage.png',      'mobile-student-icons'],
  ['icon-records.png',   'mobile-student-icons'],
  ['icon-notify.png',    'mobile-student-icons'],
  ['icon-group.png',     'mobile-student-icons'],
  ['icon-violation.png', 'mobile-student-icons'],
  ['logohs.png',         'images'],
];

let ok = 0;
let fail = 0;

for (const [name, sub] of TASKS) {
  const src = resolve(SRC, name);
  const dstDir = resolve(PUBLIC, sub);
  const dst = resolve(dstDir, name);

  if (!existsSync(src)) {
    console.error(`[copy-mini-assets] ❌ 源文件不存在: ${src}`);
    fail++;
    continue;
  }

  mkdirSync(dstDir, { recursive: true });
  copyFileSync(src, dst);
  ok++;
}

if (fail > 0) {
  console.error(`[copy-mini-assets] 完成 ${ok}/${ok+fail} (${fail} 失败)`);
  process.exitCode = 1;
} else {
  console.log(`[copy-mini-assets] ✅ 已同步 ${ok} 个小程序图标到 frontend/public/`);
}
