import type { DtWidgetGraphicAsset } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";

/** 与 sceneLayoutStorage 内联裁剪一致；超大图请走素材库（IndexedDB）或自动转存 */
export const MAX_WIDGET_GRAPHIC_DATA_URL_LEN = 900_000;

export function mimeFromGraphicFile(f: File): DtWidgetGraphicAsset["mime"] | null {
  const n = f.name.toLowerCase();
  if (f.type === "image/svg+xml" || n.endsWith(".svg")) return "image/svg+xml";
  if (f.type === "image/png" || n.endsWith(".png")) return "image/png";
  if (f.type === "image/jpeg" || /\.jpe?g$/i.test(n)) return "image/jpeg";
  if (f.type === "image/webp" || n.endsWith(".webp")) return "image/webp";
  if (f.type === "image/gif" || n.endsWith(".gif")) return "image/gif";
  return null;
}

const THUMB_MAX_SIDE = 72;
/** 列表缩略图 data URL 上限（字符），过大则丢弃缩略图 */
const THUMB_MAX_DATA_URL_LEN = 90_000;

/**
 * 从栅格 data URL 生成小缩略图（画布等比缩小）；SVG 返回 undefined；GIF 取首帧。
 * 透明图用 PNG，其余用 JPEG 以控制体积。
 */
export function buildRasterThumbDataUrl(
  dataUrl: string,
  mime: DtWidgetGraphicAsset["mime"]
): Promise<string | undefined> {
  if (mime === "image/svg+xml") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        resolve(undefined);
        return;
      }
      const scale = Math.min(1, THUMB_MAX_SIDE / Math.max(w, h));
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(undefined);
        return;
      }
      ctx.drawImage(img, 0, 0, tw, th);
      try {
        const usePng = mime === "image/png" || mime === "image/webp" || mime === "image/gif";
        let out = usePng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.72);
        if (out.length > THUMB_MAX_DATA_URL_LEN) {
          out = canvas.toDataURL("image/jpeg", 0.55);
        }
        if (out.length > THUMB_MAX_DATA_URL_LEN) {
          resolve(undefined);
          return;
        }
        resolve(out);
      } catch {
        resolve(undefined);
      }
    };
    img.onerror = () => resolve(undefined);
    img.src = dataUrl;
  });
}

export function basenameWithoutExtension(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, "");
  const noExt = base.replace(/\.[^.]+$/, "");
  return (noExt || base).trim();
}

/** 栅格图从 data URL 读取像素尺寸；失败或 SVG 请在外层走默认占位比例 */
export function measureRasterFromDataUrl(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        resolve(null);
        return;
      }
      resolve({ w, h });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * 按图片宽高比给出板件默认 nw/nh（归一化），便于新图标落画布后比例自然。
 * 与 dtWidgetPlateLimits.DT_WIDGET_PLATE_MIN 相容（落板后仍可继续缩小）。
 */
export function defaultPlateForCustomIconImage(naturalW: number, naturalH: number): { nw: number; nh: number } {
  const maxSide = 0.12;
  const minSide = 0.02;
  if (!Number.isFinite(naturalW) || !Number.isFinite(naturalH) || naturalW <= 0 || naturalH <= 0) {
    return { nw: 0.12, nh: 0.12 };
  }
  const r = naturalW / naturalH;
  let nw: number;
  let nh: number;
  if (r >= 1) {
    nw = maxSide;
    nh = Math.max(minSide, Math.min(maxSide, nw / r));
  } else {
    nh = maxSide;
    nw = Math.max(minSide, Math.min(maxSide, nh * r));
  }
  return { nw, nh };
}
