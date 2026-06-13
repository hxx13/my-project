import { useEffect, useMemo, useRef, useState } from "react";
import { PAGE_HELP_PROSE_CLASS, preparePageHelpHtml } from "@/utils/pageHelpHtml";
import { cn } from "@/lib/utils";
import { PageHelpImageLightbox } from "@/features/page-help/PageHelpImageLightbox";

type Props = {
  html: string;
  className?: string;
  /** html 为空时展示的占位（需为已消毒的安全 HTML 片段） */
  emptyHtml?: string;
};

/** 帮助富文本正文：排版 + 图片点击放大 */
export function PageHelpProseHtml({ html, className, emptyHtml }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  const displayHtml = useMemo(() => {
    const prepared = preparePageHelpHtml(html);
    return prepared || emptyHtml || "";
  }, [html, emptyHtml]);

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
  }, [displayHtml]);

  return (
    <>
      <div
        ref={containerRef}
        data-modal-scroll
        className={cn(PAGE_HELP_PROSE_CLASS, className)}
        dangerouslySetInnerHTML={{ __html: displayHtml }}
      />
      {lightbox ? (
        <PageHelpImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      ) : null}
    </>
  );
}
