import jsQR from "jsqr";

/**
 * 主路径：createImageBitmap 让浏览器原生解码+缩放，不经过 Image 元素。
 * 移动端 drawImage 对大图的纹理上传有限制（通常 2048-4096px），
 * createImageBitmap 的 resize 参数在解码阶段就缩小到安全尺寸，
 * 避免 GPU 纹理超限导致 drawImage 静默失败。
 *
 * 降级：Image + canvas（createImageBitmap 不可用时）。
 */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  // 主路径
  if (typeof createImageBitmap !== "undefined") {
    const result = await tryBitmap(file);
    if (result) return result;
  }

  // 降级
  return tryImage(file);
}

// ======================== 主路径 ========================

async function tryBitmap(file: File): Promise<string | null> {
  let bitmap: ImageBitmap | null = null;
  try {
    // 800px——万无一失，所有手机 GPU 纹理上限都远大于 800²=0.64M 像素
    bitmap = await createImageBitmap(file, { resizeWidth: 800, resizeHeight: 800 });
  } catch {
    return null;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0);

    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

    // 校验：取样四角像素，确认 drawImage 真正画上去了（不是纯白）
    const d = imageData.data;
    const corners = [d[0], d[1], d[2], d[3],                            // (0,0)
                     d[d.length-4], d[d.length-3], d[d.length-2], d[d.length-1]]; // 右下角
    const allWhite = corners.every(v => v >= 250);
    if (allWhite) {
      console.warn("[QR] drawImage 疑似静默失败——canvas 全白", {
        file: file.name,
        bitmap: `${bitmap.width}×${bitmap.height}`,
      });
      return null;
    }

    return tryDecode(imageData, file.name, bitmap.width, bitmap.height, "bitmap");
  } finally {
    bitmap.close();
  }
}

// ======================== 降级路径 ========================

function tryImage(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      // 缩到 800px 以内，避免移动端 drawImage 纹理超限
      const MAX = 800;
      const { width, height } =
        img.naturalWidth <= MAX && img.naturalHeight <= MAX
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : (() => {
              const s = MAX / Math.max(img.naturalWidth, img.naturalHeight);
              return { width: Math.round(img.naturalWidth * s), height: Math.round(img.naturalHeight * s) };
            })();

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }

      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);

      // 校验 drawImage 是否成功
      const d = imageData.data;
      const allWhite = d[0] >= 250 && d[1] >= 250 && d[2] >= 250 && d[d.length-4] >= 250;
      if (allWhite) {
        console.warn("[QR] drawImage 疑似静默失败——canvas 全白", {
          file: file.name,
          orig: `${img.naturalWidth}×${img.naturalHeight}`,
          canvas: `${width}×${height}`,
        });
        resolve(null);
        return;
      }

      resolve(tryDecode(imageData, file.name, img.naturalWidth, img.naturalHeight, "image"));
    };

    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// ======================== 解码 ========================

function tryDecode(
  imageData: ImageData,
  fileName: string,
  origW: number,
  origH: number,
  path: string,
): string | null {
  const { data, width, height } = imageData;

  // 1. 彩色
  let code = jsQR(data, width, height);
  if (code) {
    console.warn(`[QR] ✓ 彩色 (${path})`, { file: fileName, orig: `${origW}×${origH}`, canvas: `${width}×${height}` });
    return code.data;
  }

  // 2. 灰度
  for (let i = 0; i < data.length; i += 4) {
    const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = data[i + 1] = data[i + 2] = g;
  }
  code = jsQR(data, width, height);
  if (code) {
    console.warn(`[QR] ✓ 灰度 (${path})`, { file: fileName, orig: `${origW}×${origH}`, canvas: `${width}×${height}` });
    return code.data;
  }

  // 3. 自适应阈值二值化
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) { sum += data[i]; n++; }
  const thresh = sum / n;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] >= thresh ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  code = jsQR(data, width, height);
  if (code) {
    console.warn(`[QR] ✓ 二值化 (${path})`, { file: fileName, orig: `${origW}×${origH}`, canvas: `${width}×${height}` });
    return code.data;
  }

  console.warn(`[QR] ✗ (${path})`, { file: fileName, orig: `${origW}×${origH}`, canvas: `${width}×${height}` });
  return null;
}

export function extract19DigitId(text: string): string | null {
  const m = text.match(/\d{19}/);
  if (m) return m[0];
  const digits = text.replace(/\D/g, "");
  return digits.length === 19 ? digits : null;
}
