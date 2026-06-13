/**
 * 前端图片压缩工具 — Canvas 实现，零依赖。
 * 将大图缩放到合理尺寸 + JPEG 质量压缩后再上传，防止超时/失败。
 */

export interface CompressOptions {
  /** 最大宽度（px），超过则等比缩放。默认 1920 */
  maxWidth?: number;
  /** 最大高度（px），超过则等比缩放。默认 1920 */
  maxHeight?: number;
  /** JPEG 输出质量 0-1。默认 0.8 */
  quality?: number;
  /** 最大文件大小（字节），超过则循环降质。默认 2MB */
  maxSize?: number;
}

const DEFAULT: Required<CompressOptions> = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.8,
  maxSize: 2 * 1024 * 1024, // 2MB
};

/**
 * 压缩图片文件，返回新的 File 对象。
 * PNG → JPEG（体积更小）。小于 maxSize 的图片直接返回原文件。
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  const opts = { ...DEFAULT, ...options };

  // 小于阈值直接返回
  if (file.size <= opts.maxSize) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // 计算缩放后的尺寸
      let { width, height } = img;
      if (width > opts.maxWidth) {
        height = Math.round((height * opts.maxWidth) / width);
        width = opts.maxWidth;
      }
      if (height > opts.maxHeight) {
        width = Math.round((width * opts.maxHeight) / height);
        height = opts.maxHeight;
      }

      // Canvas 绘制
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file); // 极端降级：返回原文件
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // 递进压缩：从目标质量开始，不够就降
      const tryCompress = (q: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            if (blob.size <= opts.maxSize || q <= 0.3) {
              const compressed = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
                type: 'image/jpeg',
              });
              resolve(compressed);
            } else {
              tryCompress(q - 0.1);
            }
          },
          'image/jpeg',
          q,
        );
      };

      tryCompress(opts.quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // 加载失败返回原文件
    };

    img.src = url;
  });
}
