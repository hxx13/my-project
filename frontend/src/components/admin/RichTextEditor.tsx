import { useCallback, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { FileText, Image as ImageIcon } from "lucide-react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { uploadRichImage } from "@/api/domains/mpContentHub.api";
import { isRichTextEmpty } from "@/utils/announcementHtml";
import { cn } from "@/lib/utils";
import {
  collectClipboardImageFiles,
  convertMarkdownToEditorHtml,
  isMarkdownFile,
  readMarkdownFile,
  shouldPasteAsMarkdown,
} from "@/components/admin/richTextEditorPaste";

type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  className?: string;
};

const toolbarBtnClass =
  "rounded-[var(--app-radius-element)] px-2 py-1 text-xs font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)] disabled:opacity-40";

export function RichTextEditor({ value, onChange, disabled, className }: Props) {
  const lastEmittedHtmlRef = useRef<string | null>(null);
  const mdFileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const insertUploadedImages = useCallback(async (editor: Editor, files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    let ok = 0;
    for (const file of imgs) {
      try {
        const src = await uploadRichImage(file);
        editor.chain().focus().setImage({ src }).run();
        ok += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "图片上传失败");
      }
    }
    if (ok > 0) {
      toast.success(ok > 1 ? `已插入 ${ok} 张图片` : "图片已插入");
    }
  }, []);

  const applyMarkdownHtml = useCallback((editor: Editor, markdown: string, mode: "insert" | "replace") => {
    const html = convertMarkdownToEditorHtml(markdown);
    if (!html) {
      toast.error("无法解析 Markdown");
      return;
    }
    if (mode === "replace") {
      editor.commands.setContent(html, { emitUpdate: true });
    } else {
      editor.chain().focus().insertContent(html).run();
    }
    toast.success(mode === "replace" ? "已导入 Markdown" : "已粘贴 Markdown");
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Image.configure({
        inline: true,
        allowBase64: false,
      }),
    ],
    content: value || "",
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      handlePaste: (_view, event) => {
        const ed = editorRef.current;
        if (!ed) return false;
        const clipboard = event.clipboardData;
        if (!clipboard || disabled) return false;

        const imageFiles = collectClipboardImageFiles(clipboard);
        if (imageFiles.length > 0) {
          event.preventDefault();
          void insertUploadedImages(ed, imageFiles);
          return true;
        }

        if (shouldPasteAsMarkdown(clipboard)) {
          const md = clipboard.getData("text/plain");
          event.preventDefault();
          const mode = isRichTextEmpty(ed.getHTML()) ? "replace" : "insert";
          applyMarkdownHtml(ed, md, mode);
          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      lastEmittedHtmlRef.current = html;
      onChange(html);
    },
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed;
    },
    onDestroy: () => {
      editorRef.current = null;
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const incoming = value || "";
    if (incoming === lastEmittedHtmlRef.current) {
      lastEmittedHtmlRef.current = null;
      return;
    }
    const cur = editor.getHTML();
    if (incoming !== cur) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
    lastEmittedHtmlRef.current = null;
  }, [value, editor]);

  const insertImage = useCallback(async () => {
    if (!editor || disabled) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async () => {
      const files = input.files ? Array.from(input.files) : [];
      if (!files.length) return;
      await insertUploadedImages(editor, files);
    };
    input.click();
  }, [editor, disabled, insertUploadedImages]);

  const onImportMarkdownClick = useCallback(() => {
    if (disabled) return;
    mdFileInputRef.current?.click();
  }, [disabled]);

  const onMarkdownFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !editor) return;
      if (!isMarkdownFile(file)) {
        toast.error("请选择 .md / .txt 文件");
        return;
      }
      try {
        const md = await readMarkdownFile(file);
        if (!isRichTextEmpty(editor.getHTML()) && !window.confirm("导入将替换当前正文，是否继续？")) {
          return;
        }
        applyMarkdownHtml(editor, md, "replace");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "读取文件失败");
      }
    },
    [editor, applyMarkdownHtml],
  );

  if (!editor) {
    return (
      <div className="min-h-[200px] rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm text-[var(--app-color-text-tertiary)]">
        加载编辑器…
      </div>
    );
  }

  return (
    <div className={cn("page-help-rich-editor space-y-2", className)}>
      <div className="flex flex-wrap gap-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1">
        <button type="button" disabled={disabled} className={toolbarBtnClass} onClick={() => editor.chain().focus().toggleBold().run()}>
          粗体
        </button>
        <button type="button" disabled={disabled} className={toolbarBtnClass} onClick={() => editor.chain().focus().toggleItalic().run()}>
          斜体
        </button>
        <button type="button" disabled={disabled} className={toolbarBtnClass} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          列表
        </button>
        <button type="button" disabled={disabled} className={toolbarBtnClass} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          编号
        </button>
        <button type="button" disabled={disabled} className={toolbarBtnClass} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          标题
        </button>
        <button type="button" disabled={disabled} className={toolbarBtnClass} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          引用
        </button>
        <button type="button" disabled={disabled} className={toolbarBtnClass} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          分割线
        </button>
        <button
          type="button"
          disabled={disabled}
          className={cn(toolbarBtnClass, "inline-flex items-center gap-1")}
          onClick={() => void insertImage()}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          图片
        </button>
        <button
          type="button"
          disabled={disabled}
          className={cn(toolbarBtnClass, "inline-flex items-center gap-1")}
          onClick={onImportMarkdownClick}
        >
          <FileText className="h-3.5 w-3.5" />
          导入 MD
        </button>
        <input ref={mdFileInputRef} type="file" accept=".md,.markdown,.txt,text/plain" className="hidden" onChange={(e) => void onMarkdownFileChange(e)} />
      </div>
      <EditorContent
        editor={editor}
        className="min-h-[220px] rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2 text-sm text-[var(--app-color-text-primary)]"
      />
      <p className="text-[11px] leading-relaxed text-[var(--app-color-text-tertiary)]">
        支持直接粘贴 Markdown（# 标题、**粗体**、- 列表）；截图或复制图片后 Ctrl+V 可上传插入；也可点「导入 MD」选择 .md 文件。
      </p>
    </div>
  );
}
