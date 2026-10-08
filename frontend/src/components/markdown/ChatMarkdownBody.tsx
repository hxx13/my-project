import { useMemo } from "react";
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
  // 按文本 memo：父组件重渲染很频繁（打字机、实时用量），不 memo 就会**每次都重新解析 markdown
  // 并整体替换 innerHTML** —— 实测每秒几十次 DOM 重建，页面上任何"内容一变就滚到底"的监听
  // 都会被它连续触发，用户往上翻立刻被顶回底部。字符串不变时 React 会跳过 innerHTML 写入。
  const useMarkdown = Boolean(text) && !streaming && looksLikeMarkdown(text);
  const html = useMemo(
    () => (useMarkdown ? renderMarkdownToSafeHtml(text, "light") : ""),
    [useMarkdown, text],
  );

  if (!text) return null;

  if (useMarkdown) {
    return (
      <div
        className={cn(CHAT_MARKDOWN_BODY_CLASS, className)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return <div className={cn("whitespace-pre-wrap break-words", className)}>{text}</div>;
}
