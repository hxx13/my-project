import type { SyntheticEvent } from "react";

/** 给图片地址追加/替换重试参数，避免浏览器复用上一次失败结果 */
export function withRetryParam(src: string, attempt: number): string {
  if (!src) return src;
  const cleaned = src.replace(/([?&])_r=\d+/g, "$1").replace(/[?&]$/, "");
  return `${cleaned}${cleaned.includes("?") ? "&" : "?"}_r=${attempt}`;
}

/**
 * 图片加载失败自动重试（应对 nginx 限流返回的 503）。
 * 指数退避 + 抖动，最多 3 次；真实 404 也会重试几次后停止。
 */
export function retryImageOnError(maxRetries = 3) {
  return (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const tried = Number(img.dataset.retry || "0");
    if (tried >= maxRetries) return;
    const src = img.currentSrc || img.getAttribute("src") || "";
    if (!src) return;
    img.dataset.retry = String(tried + 1);
    const delay = 250 * (tried + 1) + Math.floor(Math.random() * 250);
    window.setTimeout(() => {
      img.src = withRetryParam(src, tried + 1);
    }, delay);
  };
}
