import { useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import { Image as ImageIcon } from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { uploadRichImage } from "@/api/domains/mpContentHub.api";

type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
};

export function RichTextEditor({ value, onChange, disabled }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Image.configure({
        inline: true,
        allowBase64: false,
      }),
    ],
    content: value || "",
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const cur = editor.getHTML();
    if ((value || "") !== cur) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  const insertImage = useCallback(async () => {
    if (!editor || disabled) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const src = await uploadRichImage(file);
        editor.chain().focus().setImage({ src }).run();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "上传失败");
      }
    };
    input.click();
  }, [editor, disabled]);

  if (!editor) {
    return <div className="min-h-[200px] rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-500">加载编辑器…</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          disabled={disabled}
          className="rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          粗体
        </button>
        <button
          type="button"
          disabled={disabled}
          className="rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          斜体
        </button>
        <button
          type="button"
          disabled={disabled}
          className="rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          列表
        </button>
        <button
          type="button"
          disabled={disabled}
          className="rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          编号
        </button>
        <button
          type="button"
          disabled={disabled}
          className="rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          引用
        </button>
        <button
          type="button"
          disabled={disabled}
          className="rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          分割线
        </button>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40"
          onClick={() => void insertImage()}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          图片
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="min-h-[220px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 [&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:outline-none [&_img]:mx-auto [&_img]:block [&_img]:max-h-[min(36vh,360px)] [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded [&_img]:object-contain"
      />
    </div>
  );
}
