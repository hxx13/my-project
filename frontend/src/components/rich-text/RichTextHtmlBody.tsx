import { useMemo } from "react";
import { PageHelpImageLightbox } from "@/features/page-help/PageHelpImageLightbox";
import { cn } from "@/lib/utils";
import { useRichTextImageLightbox } from "./useRichTextImageLightbox";

type Props = {
  html: string;
  className?: string;
  /** html 为空时的占位（需已消毒） */
  emptyHtml?: string;
  /** 额外 data 属性等 */
  "data-modal-scroll"?: boolean;
};

/** 富文本 HTML 展示：主题排版 + 图片点击放大 */
export function RichTextHtmlBody({ html, className, emptyHtml, ...rest }: Props) {
  const displayHtml = useMemo(() => html || emptyHtml || "", [html, emptyHtml]);
  const { containerRef, lightbox, closeLightbox } = useRichTextImageLightbox([displayHtml]);

  if (!displayHtml) return null;

  return (
    <>
      <div
        ref={containerRef}
        className={cn("rich-text-content", className)}
        dangerouslySetInnerHTML={{ __html: displayHtml }}
        {...(rest as Record<string, unknown>)}
      />
      {lightbox ? (
        <PageHelpImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={closeLightbox} />
      ) : null}
    </>
  );
}
