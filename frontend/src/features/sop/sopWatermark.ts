/**
 * 水印底纹的 SVG data URI 生成。
 *
 * 用 data URI + `background-repeat` 平铺，而不是在 DOM 里摆一堆旋转的 <span>：
 * 后者每多一行水印就多一个节点，一屏几十个；前者只有一枚 div，浏览器自己平铺。
 *
 * 两条容易踩的坑：
 *  ① 文字必须转义 —— 姓名里出现 `&` 或 `<` 会把 SVG 结构破坏掉，整块水印变空白（不报错，最难查）；
 *  ② 颜色**不能**用 `currentColor`：data URI 里的 SVG 是独立渲染上下文，拿不到宿主元素的
 *     color，会一律回落成黑色 —— 深色主题下就看不见了。所以这里收具体色值。
 */

/** XML 文本节点转义。五个实体都要覆盖，只转 `&`/`<` 会在 `"` `'` 上漏。 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type WatermarkOptions = {
  /** 平铺单元的宽高 */
  tileWidth?: number;
  tileHeight?: number;
  /** 旋转角（度），负数是常见的水印斜向 */
  rotate?: number;
  fontSize?: number;
  /** 必须是具体色值，不能用 currentColor（见文件头注释） */
  color?: string;
  opacity?: number;
  /** 两行之间的行距 */
  lineGap?: number;
};

const DEFAULTS = {
  tileWidth: 320,
  tileHeight: 220,
  rotate: -30,
  fontSize: 14,
  // 灰度中性色：PDF 页底几乎都是白的，深色主题下也还看得见
  color: "#6b7280",
  opacity: 0.16,
  lineGap: 20,
} satisfies Required<WatermarkOptions>;

/** 生成可直接塞进 `background-image: url(...)` 的 data URI；lines 为空时返回空串 */
export function buildWatermarkDataUri(lines: string[], opts: WatermarkOptions = {}): string {
  const o = { ...DEFAULTS, ...opts };
  const visible = lines.map((l) => l.trim()).filter(Boolean);
  if (visible.length === 0) return "";

  const cx = o.tileWidth / 2;
  const cy = o.tileHeight / 2;
  // 多行时整体上移半格，视觉重心才落在单元中间
  const startY = cy - ((visible.length - 1) * o.lineGap) / 2;

  const text = visible
    .map(
      (line, i) =>
        `<text x="${cx}" y="${startY + i * o.lineGap}">${escapeXml(line)}</text>`,
    )
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${o.tileWidth}" height="${o.tileHeight}">` +
    `<g transform="rotate(${o.rotate} ${cx} ${cy})" fill="${o.color}" fill-opacity="${o.opacity}"` +
    ` font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="${o.fontSize}"` +
    ` text-anchor="middle" dominant-baseline="middle">${text}</g>` +
    `</svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** 「张三」/「2026-09-14」/「请勿外传」三行 */
export function watermarkLines(identity: { name?: string | null; at?: Date }): string[] {
  const who = (identity.name || "").trim() || "未知用户";
  const d = identity.at ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return [who, date, "请勿外传"];
}
