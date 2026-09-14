import { useMemo } from "react";
import { buildWatermarkDataUri, watermarkLines } from "../sopWatermark";

/**
 * 铺在 PDF 之上的水印覆层。
 *
 * `pointer-events:none` 是必须的 —— 否则整块 PDF 都点不动（滚动、翻页、选中文本全被吃掉）。
 * 覆层是 iframe 的兄弟节点且在其后，天然绘制在上面；不需要 z-index 去抢。
 */
export function SopWatermark({ name, at }: { name: string; at: Date }) {
  const image = useMemo(() => buildWatermarkDataUri(watermarkLines({ name, at })), [name, at]);
  if (!image) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 select-none"
      style={{ backgroundImage: image, backgroundRepeat: "repeat" }}
    />
  );
}

export default SopWatermark;
