import type { JSX, ReactNode } from "react";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { AdminFilePickButton } from "@/components/admin/AdminFilePickButton";
import { isRichTextEmpty } from "@/utils/announcementHtml";

/**
 * 抗返工插槽② · 期 6：ProseMirror JSON 真源 + 派生 HTML 缓存。
 * ContentBodyValue / props 契约不变；序列化出口 switch 穷尽。
 */

export type ContentBodyValue = {
  body:
    | { kind: "html"; html: string }
    | { kind: "prosemirror"; json: Record<string, unknown>; html: string };
  imageUrls: string[];
};

export function serializeContentBody(
  v: ContentBodyValue
): { html: string; imageUrls: string[]; contentJson: string | null } {
  switch (v.body.kind) {
    case "html":
      return { html: v.body.html.trim(), imageUrls: v.imageUrls, contentJson: null };
    case "prosemirror":
      return {
        html: v.body.html.trim(),
        imageUrls: v.imageUrls,
        contentJson: JSON.stringify(v.body.json ?? {}),
      };
    default: {
      const kind: never = v.body;
      throw new Error(`Unsupported content body kind: ${(kind as { kind: string }).kind}`);
    }
  }
}

/** 从后端字段构造。优先 JSON 真源。 */
export function contentBodyFromHtml(
  html: string | null | undefined,
  imageUrls: string[] | null | undefined,
  contentJson?: string | null
): ContentBodyValue {
  if (contentJson && contentJson.trim()) {
    try {
      const json = JSON.parse(contentJson) as Record<string, unknown>;
      return {
        body: { kind: "prosemirror", json, html: html ?? "" },
        imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
      };
    } catch {
      /* fall through to html */
    }
  }
  return {
    body: { kind: "html", html: html ?? "" },
    imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
  };
}

type ContentBodySlotProps = {
  value: ContentBodyValue;
  onChange: (next: ContentBodyValue) => void;
  placeholder?: string;
  uploading?: boolean;
  /** 单独上传图片入口；不传则隐藏「添加图片」按钮（改用正文内联图片） */
  onPickFiles?: (files: FileList | null) => void;
  templateSlot?: ReactNode;
  disabled?: boolean;
};

function editorHtml(v: ContentBodyValue): string {
  return v.body.kind === "html" ? v.body.html : v.body.html;
}

export function ContentBodySlot({
  value,
  onChange,
  placeholder,
  uploading = false,
  onPickFiles,
  templateSlot,
  disabled = false,
}: ContentBodySlotProps): JSX.Element {
  const html = editorHtml(value);

  const removeImage = (url: string) => {
    onChange({ ...value, imageUrls: value.imageUrls.filter((u) => u !== url) });
  };

  return (
    <div className="flex flex-col gap-2">
      {templateSlot != null ? <div>{templateSlot}</div> : null}

      <RichTextEditor
        value={html}
        onChange={(nextHtml) => {
          // 无 JSON 回调时的兜底；有 onChangeJson 时随后会被同一次更新覆盖为 prosemirror
          if (value.body.kind === "prosemirror") {
            onChange({ ...value, body: { ...value.body, html: nextHtml } });
          } else {
            onChange({ ...value, body: { kind: "html", html: nextHtml } });
          }
        }}
        onChangeJson={(nextHtml, json) => {
          onChange({
            ...value,
            body: { kind: "prosemirror", json, html: nextHtml },
          });
        }}
        disabled={disabled}
      />

      {placeholder != null && isRichTextEmpty(html) ? (
        <p className="text-xs text-[var(--app-color-text-secondary)]">{placeholder}</p>
      ) : null}

      {value.imageUrls.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.imageUrls.map((url) => (
            <div key={url} className="relative">
              <img
                src={url}
                alt=""
                className="h-16 w-16 rounded-md border border-[var(--app-color-border-default)] object-cover"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeImage(url)}
                aria-label="移除图片"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-xs leading-none text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)] disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {onPickFiles != null ? (
        <AdminFilePickButton multiple disabled={disabled || uploading} onFiles={onPickFiles} className="self-start">
          {uploading ? "上传中…" : "添加图片"}
        </AdminFilePickButton>
      ) : null}
    </div>
  );
}
