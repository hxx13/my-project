import { useMemo } from "react";
import { PAGE_HELP_PROSE_CLASS, preparePageHelpHtml } from "@/utils/pageHelpHtml";
import { cn } from "@/lib/utils";
import { RichTextHtmlBody } from "@/components/rich-text/RichTextHtmlBody";

type Props = {
  html: string;
  className?: string;
  /** html 为空时展示的占位（需为已消毒的安全 HTML 片段） */
  emptyHtml?: string;
};

/** 帮助富文本正文：排版 + 图片点击放大 */
export function PageHelpProseHtml({ html, className, emptyHtml }: Props) {
  const displayHtml = useMemo(() => {
    const prepared = preparePageHelpHtml(html);
    return prepared || emptyHtml || "";
  }, [html, emptyHtml]);

  if (!displayHtml) return null;

  return (
    <RichTextHtmlBody
      html={displayHtml}
      className={cn(PAGE_HELP_PROSE_CLASS, className)}
      data-modal-scroll
    />
  );
}
