import { looksLikeMarkdown, renderMarkdownToSafeHtml } from "@/utils/markdownHtml";

export function collectClipboardImageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const collected: File[] = [];
  if (data.files?.length) {
    collected.push(...Array.from(data.files));
  }
  if (!collected.length && data.items?.length) {
    for (let i = 0; i < data.items.length; i += 1) {
      const item = data.items[i];
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) collected.push(f);
      }
    }
  }
  return collected.filter((f) => f.type.startsWith("image/"));
}

/** 剪贴板 HTML 是否像富文本编辑器产物（有结构标签） */
export function clipboardHtmlLooksRich(html: string | undefined): boolean {
  if (!html?.trim()) return false;
  return /<(?:h[1-6]|ul|ol|table|blockquote|strong|em|img)\b/i.test(html);
}

export function convertMarkdownToEditorHtml(markdown: string): string {
  return renderMarkdownToSafeHtml(markdown, "light");
}

export function shouldPasteAsMarkdown(clipboard: DataTransfer): boolean {
  const text = clipboard.getData("text/plain");
  if (!text?.trim() || !looksLikeMarkdown(text)) {
    return false;
  }
  const html = clipboard.getData("text/html");
  return !clipboardHtmlLooksRich(html);
}

export function readMarkdownFile(file: File): Promise<string> {
  return file.text();
}

export function isMarkdownFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".txt") || file.type.startsWith("text/");
}
