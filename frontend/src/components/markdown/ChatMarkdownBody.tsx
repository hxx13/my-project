import { looksLikeMarkdown, renderMarkdownToSafeHtml } from "@/utils/markdownHtml";
import { cn } from "@/lib/utils";

export const CHAT_MARKDOWN_BODY_CLASS =
  "chat-markdown-body break-words [&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul:last-child]:mb-0 [&_table]:max-w-full";

type Props = {
  text: string;
  className?: string;
  /** 流式输出中保持纯文本，避免半截 Markdown 结构错乱 */
  streaming?: boolean;
};

export function ChatMarkdownBody({ text, className, streaming }: Props) {
  if (!text) return null;

  const useMarkdown = !streaming && looksLikeMarkdown(text);

  if (useMarkdown) {
    const html = renderMarkdownToSafeHtml(text, "light");
    return (
      <div
        className={cn(CHAT_MARKDOWN_BODY_CLASS, className)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return <div className={cn("whitespace-pre-wrap break-words", className)}>{text}</div>;
}
