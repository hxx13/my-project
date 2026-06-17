import { useEffect, useRef, useState } from "react";

export type RichTextLightboxState = {
  src: string;
  alt: string;
};

/**
 * 富文本容器内图片点击放大（事件委托）。
 * resetDeps 变化时重新绑定（例如 html 更新后）。
 */
export function useRichTextImageLightbox(resetDeps: unknown[] = []) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<RichTextLightboxState | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement) || !root.contains(target)) return;
      const src = target.currentSrc || target.src;
      if (!src) return;
      event.preventDefault();
      event.stopPropagation();
      setLightbox({ src, alt: target.alt || "" });
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 由调用方传入 html 等重置键
  }, resetDeps);

  return {
    containerRef,
    lightbox,
    closeLightbox: () => setLightbox(null),
  };
}
