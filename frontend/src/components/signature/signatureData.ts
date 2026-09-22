/**
 * 签名数据纯逻辑：不依赖 React / DOM，可在 node 环境下直接单测。
 */

/**
 * 签名画布规范：固定 800×300、白底、PNG。
 *
 * <p>尺寸统一才好贴进文档 —— 后端按同一个比例裁白边再缩放，屏上画布也必须按这个比例，
 * 否则导出时会被拉伸。放这里是为了让「卡片」「整屏横屏板」「公开链接页」共用一份，不各写一套。
 */
export const SIGNATURE_CANVAS = { width: 800, height: 300 };

/** 签名区宽高比（8:3）。屏上画布与导出图共用同一个比例，写多大都一样。 */
export const SIGNATURE_RATIO = SIGNATURE_CANVAS.width / SIGNATURE_CANVAS.height;

/**
 * 在 availW × availH 的可用区里放**最大**的一块签名画布，比例恒为 {@link SIGNATURE_RATIO}。
 *
 * <p>等比缩放（不裁剪也不拉伸）：宽度与高度谁先受限就由谁决定边长，取整误差最多半个像素，
 * 相对误差 < 0.2%。
 */
export function fitSignatureBox(availW: number, availH: number) {
  const width = Math.round(Math.min(availW, availH * SIGNATURE_RATIO));
  return { width, height: Math.round(width / SIGNATURE_RATIO) };
}

/** 按最长边等比缩放，只缩不放；返回取整后的尺寸 */
export function fitSize(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
