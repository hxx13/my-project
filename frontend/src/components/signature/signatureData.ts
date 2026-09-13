/**
 * 签名数据纯逻辑：不依赖 React / DOM，可在 node 环境下直接单测。
 */

/** 按最长边等比缩放，只缩不放；返回取整后的尺寸 */
export function fitSize(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
