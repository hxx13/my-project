/**
 * npm install / 构建 npm 后执行：移除 Vant Icon 组件 wxss 内的 @font-face。
 * 小程序禁止在 miniprogram_npm 组件样式里用本地路径加载字体；
 * 字体仅在 miniprogram/app.wxss 中声明（./assets/fonts/）。
 *
 * 用法：node scripts/patch-vant-icon-font.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconWxss = path.join(
  root,
  'aroapp/miniprogram/miniprogram_npm/@vant/weapp/icon/index.wxss',
);
const fontFaceRe =
  /@font-face\{font-display:auto;font-family:vant-icon;font-style:normal;font-weight:400;src:url\([^}]+\}/g;

if (!fs.existsSync(iconWxss)) {
  console.warn('[patch-vant-icon-font] 跳过：未找到', iconWxss);
  process.exit(0);
}

let text = fs.readFileSync(iconWxss, 'utf8');
if (!fontFaceRe.test(text)) {
  console.log('[patch-vant-icon-font] 已无 @font-face，跳过');
  process.exit(0);
}
fontFaceRe.lastIndex = 0;
text = text.replace(fontFaceRe, '');
fs.writeFileSync(iconWxss, text);
console.log('[patch-vant-icon-font] 已移除组件内 @font-face:', iconWxss);
