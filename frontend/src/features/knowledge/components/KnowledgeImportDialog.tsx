import { useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { importKnowledgePage } from "@/api/domains/knowledge.api";
import { useKnowledgeCategories } from "@/features/knowledge/hooks/useKnowledgeCategories";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Props { open: boolean; onClose: () => void; onImported: () => void }

export function KnowledgeImportDialog({ open, onClose, onImported }: Props) {
  const { data: tree } = useKnowledgeCategories();
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<"markdown" | "html">("markdown");
  const [importing, setImporting] = useState(false);

  const cats = tree?.flatMap(n => [n, ...n.children]) ?? [];

  async function handleImport() {
    if (!categoryId || !title || !content) return;
    setImporting(true);
    try {
      await importKnowledgePage({ categoryId, title, content, format, author: "admin" });
      onImported(); onClose();
    } catch (e: any) { alert(`导入失败: ${e.message}`); }
    finally { setImporting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导入文档</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <select value={categoryId ?? ""} onChange={e => setCategoryId(Number(e.target.value) || null)} className="w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm">
            <option value="">选择分类</option>
            {cats.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
          </select>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="文档标题" className="w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm" />
          <select value={format} onChange={e => setFormat(e.target.value as any)} className="w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm">
            <option value="markdown">Markdown</option>
            <option value="html">HTML</option>
          </select>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder={format === "markdown" ? "# Markdown 内容…" : "HTML 内容…"} rows={8} className="w-full rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm font-mono resize-y" />
        </div>
        <DialogFooter>
          <button onClick={handleImport} disabled={importing || !categoryId || !title || !content} className="rounded-lg bg-[var(--app-color-accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 flex items-center gap-2">
            {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {importing ? "导入中…" : "导入"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
