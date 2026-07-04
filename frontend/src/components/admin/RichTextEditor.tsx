import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import toast from "react-hot-toast";
import { FileText, Image as ImageIcon } from "lucide-react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { NodeSelection } from "prosemirror-state";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { uploadRichImage } from "@/api/domains/mpContentHub.api";
import { isRichTextEmpty } from "@/utils/announcementHtml";
import { cn } from "@/lib/utils";
import {
  formatMaxWidthPercent,
  parseMaxWidthPercent,
  parseWidthPercentFromStyle,
  resolveRichTextImageConfig,
  richTextImageConfigToCssVars,
  richTextImageHelpText,
  richTextImageInlineStyle,
  type RichTextImageConfigOverrides,
} from "@/config/richTextImage";
import {
  RICH_TEXT_HIGHLIGHT_PRESETS,
  RICH_TEXT_TEXT_COLOR_PRESETS,
} from "@/config/richTextColorPresets";
import { PageHelpImageLightbox } from "@/features/page-help/PageHelpImageLightbox";
import { useRichTextImageLightbox } from "@/components/rich-text/useRichTextImageLightbox";
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
} & RichTextImageConfigOverrides;

const toolbarBtnClass =
  "rounded-[var(--app-radius-element)] px-2 py-1 text-xs font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)] disabled:opacity-40";

const swatchBtnClass =
  "h-5 w-5 shrink-0 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] hover:ring-2 hover:ring-[var(--app-color-accent-secondary)] disabled:opacity-40";

const toolbarInputClass =
  "w-10 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-1 py-0.5 text-center text-xs text-[var(--app-color-text-primary)] disabled:opacity-40";

const toolbarRangeClass =
  "h-1.5 min-w-[72px] flex-1 cursor-pointer accent-[var(--app-color-accent-secondary)] disabled:cursor-not-allowed disabled:opacity-40";

/** 保留 style 属性，便于图宽百分比写入 HTML；忽略 width/height 以免高度被锁死 */
const RichTextImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
      height: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute("style"),
        renderHTML: (attributes) => {
          if (!attributes.style) return {};
          return { style: attributes.style };
        },
      },
    };
  },
});

function countImagesInParent(doc: Editor["state"]["doc"], pos: number): number {
  const parent = doc.resolve(pos).parent;
  let imgCount = 0;
  parent.forEach((child) => {
    if (child.type.name === "image") imgCount += 1;
  });
  return imgCount;
}

function findFirstImageWidthPct(editor: Editor): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node) => {
    if (found != null) return false;
    if (node.type.name !== "image") return;
    const pct = parseWidthPercentFromStyle(node.attrs.style);
    if (pct != null) found = pct;
  });
  return found;
}

function readActiveImageStyle(editor: Editor): string | null | undefined {
  if (editor.isActive("image")) {
    return editor.getAttributes("image").style as string | undefined;
  }
  const { selection } = editor.state;
  if (selection instanceof NodeSelection && selection.node.type.name === "image") {
    return selection.node.attrs.style as string | undefined;
  }
  return undefined;
}

function hasActiveImageSelection(editor: Editor): boolean {
  return readActiveImageStyle(editor) !== undefined;
}

/** 将工具栏图宽写入单图段落的 inline style（width %，可放大/缩小）；同行多图（rowMax≥2）由 flex 规则控制 */
function applyImageWidthStyles(
  editor: Editor,
  style: string,
  rowMax: number,
): boolean {
  if (editor.isDestroyed) return false;
  const { tr } = editor.state;
  let changed = false;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "image") return;
    if (countImagesInParent(editor.state.doc, pos) > 1 && rowMax >= 2) return;
    if (node.attrs.style === style) return;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, style });
    changed = true;
  });

  if (changed) editor.view.dispatch(tr);
  return changed;
}

export function RichTextEditor({ value, onChange, disabled, className, maxWidth, rowMax }: Props) {
  const lastEmittedHtmlRef = useRef<string | null>(null);
  const mdFileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const emitEditorHtml = useCallback((editor: Editor) => {
    const html = editor.getHTML();
    lastEmittedHtmlRef.current = html;
    onChangeRef.current(html);
  }, []);

  const initialImageLayout = useMemo(
    () => resolveRichTextImageConfig({ maxWidth, rowMax }),
    // 仅首屏：环境变量 / props 作为工具栏初值
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [imageWidthPct, setImageWidthPct] = useState(() =>
    parseMaxWidthPercent(initialImageLayout.maxWidth),
  );
  const [imageRowMax, setImageRowMax] = useState(() => initialImageLayout.rowMax);
  const imageRowMaxRef = useRef(imageRowMax);
  imageRowMaxRef.current = imageRowMax;
  const imageWidthPctRef = useRef(imageWidthPct);
  imageWidthPctRef.current = imageWidthPct;

  const imageConfig = useMemo(
    () => ({
      maxWidth: formatMaxWidthPercent(imageWidthPct),
      rowMax: Math.min(8, Math.max(1, imageRowMax)),
    }),
    [imageWidthPct, imageRowMax],
  );
  const imageCssVars = useMemo(
    () => richTextImageConfigToCssVars(imageConfig) as CSSProperties,
    [imageConfig],
  );
  const helpText = useMemo(() => richTextImageHelpText(imageConfig), [imageConfig]);

  const singleImageStyle = useCallback(() => {
    return richTextImageInlineStyle(formatMaxWidthPercent(imageWidthPctRef.current));
  }, []);

  /** 滑块调整图宽：选中单图时仅改该图；未选中时批量改单图段落（并同步父级 HTML 以便保存） */
  const applyWidthPct = useCallback(
    (pct: number) => {
      const editor = editorRef.current;
      if (!editor || editor.isDestroyed || disabled) return;
      const style = richTextImageInlineStyle(formatMaxWidthPercent(pct));
      if (hasActiveImageSelection(editor)) {
        editor.chain().focus().updateAttributes("image", { style }).run();
        return;
      }
      if (applyImageWidthStyles(editor, style, imageRowMaxRef.current)) {
        emitEditorHtml(editor);
      }
    },
    [disabled, emitEditorHtml],
  );

  const onImageWidthSliderInput = useCallback(
    (raw: string) => {
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n)) return;
      const clamped = Math.min(100, Math.max(10, n));
      setImageWidthPct(clamped);
      applyWidthPct(clamped);
    },
    [applyWidthPct],
  );

  const insertUploadedImages = useCallback(async (editor: Editor, files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    const srcs: string[] = [];
    for (const file of imgs) {
      try {
        srcs.push(await uploadRichImage(file));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "图片上传失败");
      }
    }
    if (!srcs.length) return;

    const rowMax = imageRowMaxRef.current;
    const imgStyle = singleImageStyle();

    if (srcs.length === 1) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "paragraph",
          content: [{ type: "image", attrs: { src: srcs[0], style: imgStyle } }],
        })
        .run();
      toast.success("图片已插入");
      return;
    }

    if (rowMax >= 2) {
      // 用户已将「同行」设为 2 以上：多图插入同一段落，配合 flex 横排
      editor
        .chain()
        .focus()
        .insertContent({
          type: "paragraph",
          content: srcs.map((src) => ({ type: "image", attrs: { src } })),
        })
        .run();
      toast.success(`已插入 ${srcs.length} 张图片（同一行，最多 ${rowMax} 张并排）`);
      return;
    }

    // 默认：每张单独段落，居中显示
    editor
      .chain()
      .focus()
      .insertContent(
        srcs.map((src) => ({
          type: "paragraph",
          content: [{ type: "image", attrs: { src, style: imgStyle } }],
        })),
      )
      .run();
    toast.success(`已插入 ${srcs.length} 张图片（各一行居中）`);
  }, [singleImageStyle]);

  const applyMarkdownHtml = useCallback((editor: Editor, markdown: string, mode: "insert" | "replace") => {
    const style = singleImageStyle();
    let html = convertMarkdownToEditorHtml(markdown);
    // Markdown 导入的图片无 inline style，补上当前图宽以便保存后在扫码端生效
    html = html.replace(/<img([^>]*?)>/gi, (match, attrs: string) => {
      if (/style\s*=/i.test(attrs)) return match;
      return `<img${attrs} style="${style}">`;
    });
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
  }, [singleImageStyle]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TextStyle,
      Color.configure({ types: ["textStyle"] }),
      Highlight.configure({ multicolor: true }),
      RichTextImage.configure({
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

  /** 选中图片时，滑块回显该图已保存的 width % */
  useEffect(() => {
    if (!editor) return;
    const syncSliderFromSelection = () => {
      const style = readActiveImageStyle(editor);
      if (style === undefined) return;
      const pct = parseWidthPercentFromStyle(style);
      if (pct != null && pct !== imageWidthPctRef.current) {
        setImageWidthPct(pct);
      }
    };
    editor.on("selectionUpdate", syncSliderFromSelection);
    return () => {
      editor.off("selectionUpdate", syncSliderFromSelection);
    };
  }, [editor]);

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

    const pctFromDoc = findFirstImageWidthPct(editor);
    if (pctFromDoc != null && pctFromDoc !== imageWidthPctRef.current) {
      setImageWidthPct(pctFromDoc);
    }
  }, [value, editor]);

  const { containerRef, lightbox, closeLightbox } = useRichTextImageLightbox([value, editor?.getHTML()]);

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
    <div
      ref={containerRef}
      className={cn(
        "page-help-rich-editor rich-text-content space-y-2",
        imageRowMax >= 2 && "rich-text-multi-row",
        className,
      )}
      style={imageCssVars}
    >
      <div className="flex flex-col gap-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1">
        <div className="flex flex-wrap gap-1">
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
          <span className="mx-0.5 h-4 w-px bg-[var(--app-color-border-default)] self-center" aria-hidden />
          <label className="inline-flex min-w-[148px] flex-1 items-center gap-2 text-[10px] font-medium text-[var(--app-color-text-tertiary)]">
            <span className="shrink-0">图宽</span>
            <input
              type="range"
              min={10}
              max={100}
              step={1}
              disabled={disabled}
              className={toolbarRangeClass}
              value={imageWidthPct}
              title="单图宽度（%）；选中图片时仅调整该图，否则调整全部单图段落"
              aria-valuemin={10}
              aria-valuemax={100}
              aria-valuenow={imageWidthPct}
              aria-valuetext={`${imageWidthPct}%`}
              onInput={(e) => onImageWidthSliderInput(e.currentTarget.value)}
            />
            <span className="w-9 shrink-0 text-right tabular-nums text-[var(--app-color-text-secondary)]">
              {imageWidthPct}%
            </span>
          </label>
          <label className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--app-color-text-tertiary)]">
            同行
            <input
              type="number"
              min={1}
              max={8}
              step={1}
              disabled={disabled}
              className={toolbarInputClass}
              value={imageRowMax}
              title="设为 2 以上时，多选/Ctrl+V 多图才会插入同一行；默认 1 为每张单独一行居中"
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setImageRowMax(Math.min(8, Math.max(1, n)));
              }}
            />
            <span>张</span>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1 border-t border-[var(--app-color-border-default)] pt-1">
          <span className="text-[10px] font-medium text-[var(--app-color-text-tertiary)] px-0.5">字色</span>
          {RICH_TEXT_TEXT_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              title={preset.label}
              aria-label={`字色：${preset.label}`}
              className={cn(swatchBtnClass, !preset.value && "bg-[var(--app-color-surface-page)] text-[10px] font-bold text-[var(--app-color-text-secondary)]")}
              style={preset.value ? { background: preset.value } : undefined}
              onClick={() => {
                if (!preset.value) {
                  editor.chain().focus().unsetColor().run();
                } else {
                  editor.chain().focus().setColor(preset.value).run();
                }
              }}
            >
              {!preset.value ? "A" : null}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-[var(--app-color-border-default)]" aria-hidden />
          <span className="text-[10px] font-medium text-[var(--app-color-text-tertiary)] px-0.5">色块</span>
          {RICH_TEXT_HIGHLIGHT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              title={preset.label}
              aria-label={`高亮：${preset.label}`}
              className={cn(swatchBtnClass, !preset.value && "bg-[var(--app-color-surface-page)] text-[10px] text-[var(--app-color-text-tertiary)]")}
              style={preset.value ? { background: preset.value } : undefined}
              onClick={() => {
                if (!preset.value) {
                  editor.chain().focus().unsetHighlight().run();
                } else {
                  editor.chain().focus().setHighlight({ color: preset.value }).run();
                }
              }}
            >
              {!preset.value ? "×" : null}
            </button>
          ))}
        </div>
      </div>
      <EditorContent
        editor={editor}
        className="min-h-[220px] overflow-x-hidden rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2 text-sm text-[var(--app-color-text-primary)]"
      />
      <p className="text-[11px] leading-relaxed text-[var(--app-color-text-tertiary)]">
        {helpText} 点击图片可放大预览。
      </p>
      {lightbox ? (
        <PageHelpImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={closeLightbox} />
      ) : null}
    </div>
  );
}
