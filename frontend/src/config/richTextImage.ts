/**
 * 富文本图片排版 — 由 Vite 环境变量控制，可在 RichTextEditor 上通过 props 覆盖。
 *
 * VITE_RICH_TEXT_IMAGE_MAX_WIDTH  单图最大宽度（百分数，如 50 → 50%）
 * VITE_RICH_TEXT_IMAGE_ROW_MAX     同行最多并排张数（默认 1=单图居中；≥2 时多选/Ctrl+V 才插入同一行）
 */

export type RichTextImageConfig = {
  /** 单张图片最大宽度，如 "50%" */
  maxWidth: string;
  /** 同一行最多并排图片数 */
  rowMax: number;
};

export type RichTextImageConfigOverrides = {
  maxWidth?: string;
  rowMax?: number;
};

function parsePercentWidth(raw: string | undefined, fallbackPercent: number): string {
  if (!raw?.trim()) return `${fallbackPercent}%`;
  const t = raw.trim();
  if (t.endsWith("%")) {
    const n = Number.parseFloat(t.slice(0, -1));
    if (Number.isFinite(n) && n > 0 && n <= 100) return `${n}%`;
    return `${fallbackPercent}%`;
  }
  const n = Number.parseFloat(t);
  if (Number.isFinite(n) && n > 0 && n <= 100) return `${n}%`;
  return `${fallbackPercent}%`;
}

function parseRowMax(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 8);
}

const ENV_MAX_WIDTH = import.meta.env.VITE_RICH_TEXT_IMAGE_MAX_WIDTH as string | undefined;
const ENV_ROW_MAX = import.meta.env.VITE_RICH_TEXT_IMAGE_ROW_MAX as string | undefined;

/** 读取环境变量默认值；传入 overrides 时以组件 props 为准 */
export function resolveRichTextImageConfig(
  overrides?: RichTextImageConfigOverrides,
): RichTextImageConfig {
  return {
    maxWidth: overrides?.maxWidth?.trim()
      ? parsePercentWidth(overrides.maxWidth, 50)
      : parsePercentWidth(ENV_MAX_WIDTH, 50),
    rowMax: overrides?.rowMax != null && overrides.rowMax > 0
      ? Math.min(overrides.rowMax, 8)
      : parseRowMax(ENV_ROW_MAX, 1),
  };
}

/** 默认配置（环境变量） */
export const richTextImageConfig = resolveRichTextImageConfig();

export const RICH_TEXT_IMAGE_CSS_VAR_NAMES = {
  maxWidth: "--rich-text-image-max-width",
  rowMax: "--rich-text-image-row-max",
  rowGap: "--rich-text-image-row-gap",
  /** 与 page-help 弹窗预览共用 */
  pageHelpMaxWidth: "--page-help-content-img-max-width",
} as const;

export function richTextImageConfigToCssVars(
  config: RichTextImageConfig,
): Record<string, string> {
  return {
    [RICH_TEXT_IMAGE_CSS_VAR_NAMES.maxWidth]: config.maxWidth,
    [RICH_TEXT_IMAGE_CSS_VAR_NAMES.rowMax]: String(config.rowMax),
    [RICH_TEXT_IMAGE_CSS_VAR_NAMES.pageHelpMaxWidth]: config.maxWidth,
  };
}

/** 写入 :root，供扫码公告等未挂载 RichTextEditor 的区域共用 */
export function applyRichTextImageCssVarsToRoot(config: RichTextImageConfig = richTextImageConfig): void {
  if (typeof document === "undefined") return;
  const vars = richTextImageConfigToCssVars(config);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

/** 从 "50%" 解析出数字 50 */
export function parseMaxWidthPercent(maxWidth: string): number {
  const n = Number.parseFloat(maxWidth.replace("%", "").trim());
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(100, Math.max(10, Math.round(n)));
}

/** 从 img inline style 解析 width N%（用于回显工具栏滑块） */
export function parseWidthPercentFromStyle(style: string | null | undefined): number | null {
  if (!style?.trim()) return null;
  const match = style.match(/(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)\s*%/i);
  if (!match) return null;
  return parseMaxWidthPercent(`${match[1]}%`);
}

export function formatMaxWidthPercent(percent: number): string {
  const n = Math.min(100, Math.max(10, Math.round(percent)));
  return `${n}%`;
}

/** 写入 img style：width % 可放大/缩小（max-width 仅缩小）；扫码端无 CSS 变量时仍生效 */
export function richTextImageInlineStyle(maxWidth: string): string {
  return `width: ${maxWidth}; max-width: 100%; height: auto; display: inline-block; box-sizing: border-box;`;
}

export function richTextImageHelpText(config: RichTextImageConfig): string {
  const rowHint =
    config.rowMax >= 2
      ? `同行设为 ${config.rowMax} 张时，多选/Ctrl+V 多图会插入同一行。`
      : "默认每张图片单独一行居中；需同行横排请将「同行」设为 2 以上。";
  return `图宽 ${config.maxWidth} 居中；${rowHint} 支持粘贴 Markdown、截图/Ctrl+V、导入 .md。`;
}
