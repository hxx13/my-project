import { useEffect, useRef, useState } from "react";

export type RichTextLightboxState = {
  src: string;
  alt: string;
};

export type RichTextLightboxOptions = {
  /**
   * true = 必须按住修饰键（Alt / Ctrl / ⌘）才放大。
   *
   * **编辑器里必须开**：图片上的单击是 ProseMirror 的选区手势，本 hook 在 capture 阶段
   * `preventDefault + stopPropagation` 会把它整下吃掉 —— 结果就是图片选不中、也没法把光标
   * 落到那一行（图占满整行时尤其明显，整行都是图，没有别的落点）。
   * 展示侧（门户/H5）不开：读者单击图片就是要看大图。
   *
   * 双击在两种模式下都放大（编辑器里图片双击没有别的语义），给一个不用记修饰键的入口。
   */
  requireModifier?: boolean;
};

/**
 * 富文本容器内图片点击放大（事件委托）。
 * resetDeps 变化时重新绑定（例如 html 更新后）。
 */
export function useRichTextImageLightbox(
  resetDeps: unknown[] = [],
  opts: RichTextLightboxOptions = {},
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<RichTextLightboxState | null>(null);
  const requireModifier = opts.requireModifier === true;

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    /** 事件目标是不是本容器里的图片 */
    const imageOf = (target: EventTarget | null): HTMLImageElement | null =>
      target instanceof HTMLImageElement && root.contains(target) ? target : null;

    const open = (img: HTMLImageElement, event: Event) => {
      const src = img.currentSrc || img.src;
      if (!src) return;
      event.preventDefault();
      event.stopPropagation();
      setLightbox({ src, alt: img.alt || "" });
    };

    const onClick = (event: MouseEvent) => {
      const img = imageOf(event.target);
      if (!img) return;
      if (requireModifier && !(event.altKey || event.ctrlKey || event.metaKey)) return;
      open(img, event);
    };

    const onDoubleClick = (event: MouseEvent) => {
      const img = imageOf(event.target);
      if (img) open(img, event);
    };

    // capture：先于 ProseMirror 选区处理，避免部分图片点击被编辑器吞掉
    root.addEventListener("click", onClick, true);
    root.addEventListener("dblclick", onDoubleClick, true);
    return () => {
      root.removeEventListener("click", onClick, true);
      root.removeEventListener("dblclick", onDoubleClick, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 由调用方传入 html 等重置键
  }, [...resetDeps, requireModifier]);

  return {
    containerRef,
    lightbox,
    closeLightbox: () => setLightbox(null),
  };
}
