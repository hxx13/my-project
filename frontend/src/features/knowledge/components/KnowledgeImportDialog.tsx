import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import {
  importKnowledgePage,
  importKnowledgeBatch,
  type KnowledgeImportRequest,
} from "@/api/domains/knowledge.api";
import { useKnowledgeCategories } from "@/features/knowledge/hooks/useKnowledgeCategories";

interface KnowledgeImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function KnowledgeImportDialog({ open, onClose, onImported }: KnowledgeImportDialogProps) {
  const { data: tree } = useKnowledgeCategories();
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("agent:claude:opus-4");
  const [importing, setImporting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const categories = tree?.map(n => ({ id: n.categoryId, name: n.categoryName })) ?? [];

  const handleSingleImport = async () => {
    if (!categoryId || !content || !title) return;
    setImporting(true);
    try {
      await importKnowledgePage({ categoryId, title, content, format: "markdown", author });
      onImported();
      handleClose();
    } catch { /* handled by global error handler */ }
    finally { setImporting(false); }
  };

  const handleFileUpload = async () => {
    if (!categoryId || files.length === 0) return;
    setImporting(true);
    const items: KnowledgeImportRequest[] = [];
    for (const file of files) {
      const text = await file.text();
      items.push({
        categoryId,
        title: file.name.replace(/\.md$/i, ""),
        content: text,
        format: "markdown",
        author,
      });
    }
    try {
      await importKnowledgeBatch(items);
      onImported();
      handleClose();
    } catch { /* handled by global error handler */ }
    finally { setImporting(false); }
  };

  const handleClose = () => {
    setContent("");
    setTitle("");
    setFiles([]);
    setImporting(false);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-6 shadow-[var(--app-elevation-modal)]">
        <h2 className="text-lg font-semibold text-[var(--app-color-text-primary)]">导入文档</h2>

        <div className="mt-4 space-y-4">
          {/* Category selector */}
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--app-color-text-secondary)]">目标分类</label>
            <select
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(Number(e.target.value) || null)}
              className="w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] focus:border-[var(--app-color-border-strong)] focus:outline-none"
            >
              <option value="">选择分类...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Format: Markdown only */}
          <input type="hidden" value="markdown" />

          {/* Title & Content (single import) */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="文档标题"
            className="w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-border-strong)] focus:outline-none"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="粘贴文档内容..."
            rows={8}
            className="w-full resize-y rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 font-mono text-sm text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-border-strong)] focus:outline-none"
          />

          {/* File upload zone */}
          <div
            className="cursor-pointer rounded-[var(--app-radius-container)] border-2 border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-6 text-center transition-colors hover:border-[var(--app-color-accent)] hover:bg-[var(--app-color-accent-soft)]"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setFiles(Array.from(e.dataTransfer.files).filter(f => f.name.match(/\.md$/i))); }}
          >
            <Upload className="mx-auto size-8 text-[var(--app-color-text-tertiary)]" />
            <p className="mt-2 text-sm text-[var(--app-color-text-secondary)]">拖拽文件到此处或点击选择</p>
            <p className="text-xs text-[var(--app-color-text-tertiary)]">支持 .md 格式</p>
            <input ref={fileInputRef} type="file" multiple accept=".md" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </div>

          {files.length > 0 && (
            <div className="space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-page)] px-2 py-1 text-xs text-[var(--app-color-text-secondary)]">
                  <FileText className="size-3" /> {f.name}
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="ml-auto text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-danger)]"><X className="size-3" /></button>
                </div>
              ))}
            </div>
          )}

          {/* Author */}
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="作者标识"
            className="w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm text-[var(--app-color-text-secondary)] focus:border-[var(--app-color-border-strong)] focus:outline-none"
          />
        </div>

        {/* Buttons */}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={handleClose} className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-3 py-1.5 text-sm font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]">
            取消
          </button>
          <button
            onClick={files.length > 0 ? handleFileUpload : handleSingleImport}
            disabled={importing || !categoryId}
            className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--app-color-accent-hover)] disabled:opacity-50"
          >
            {importing && <Loader2 className="mr-1 inline size-3 animate-spin" />}
            {files.length > 0 ? `开始导入 (${files.length})` : "导入"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
