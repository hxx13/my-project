/**
 * 将 assets/fonts/vant-icon.woff2 编码为 JS 模块，供 app.js wx.loadFontFace 使用。
 * 用法：node scripts/encode-vant-icon-font.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const woff2 = path.join(root, 'aroapp/miniprogram/assets/fonts/vant-icon.woff2');
const outJs = path.join(root, 'aroapp/miniprogram/assets/fonts/vantIconFontBase64.js');

if (!fs.existsSync(woff2)) {
  console.error('[encode-vant-icon-font] 缺少', woff2);
  process.exit(1);
}

const b64 = fs.readFileSync(woff2).toString('base64');
fs.writeFileSync(outJs, `module.exports = { VANT_ICON_WOFF2_BASE64: ${JSON.stringify(b64)} };\n`);
console.log('[encode-vant-icon-font] 已写入', outJs, `(${b64.length} chars)`);
