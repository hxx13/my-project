import { useState } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useKnowledgeCategories } from "@/features/knowledge/hooks/useKnowledgeCategories";
import { useKnowledgeCategoryManager } from "@/features/knowledge/hooks/useKnowledgeCategoryManager";

export function KnowledgeCategoryManager() {
  const { data: tree, isLoading } = useKnowledgeCategories();
  const { createMutation, updateMutation, deleteMutation } = useKnowledgeCategoryManager();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [icon, setIcon] = useState("BookOpen");

  const resetForm = () => {
    setName("");
    setSlug("");
    setIcon("BookOpen");
    setShowForm(false);
    setEditingId(null);
  };

  const handleCreate = () => {
    if (!name || !slug) return;
    createMutation.mutate(
      { name, slug, icon, sortOrder: 0 },
      { onSuccess: resetForm }
    );
  };

  const handleUpdate = (id: number) => {
    if (!name || !slug) return;
    updateMutation.mutate(
      { id, name, slug, icon },
      { onSuccess: resetForm }
    );
  };

  const startEdit = (cat: { categoryId: number; categoryName: string; categorySlug: string; icon: string }) => {
    setEditingId(cat.categoryId);
    setName(cat.categoryName);
    setSlug(cat.categorySlug);
    setIcon(cat.icon);
    setShowForm(true);
  };

  const allCategories = tree?.map(n => ({
    id: n.categoryId,
    name: n.categoryName,
    slug: n.categorySlug,
    icon: n.icon,
    pageCount: n.pages.length,
  })) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--app-color-text-primary)]">分类管理</h3>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--app-color-accent-hover)]"
        >
          <Plus className="mr-1 inline size-3" />新建分类
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="分类名称"
            className="w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2.5 py-1.5 text-sm text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-border-strong)] focus:outline-none"
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="URL 标识（英文字母）"
            className="w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2.5 py-1.5 text-sm font-mono text-[var(--app-color-text-secondary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-border-strong)] focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={editingId ? () => handleUpdate(editingId) : handleCreate}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--app-color-accent-hover)] disabled:opacity-50"
            >
              {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="inline size-3 animate-spin" /> : null}
              {editingId ? "保存" : "创建"}
            </button>
            <button onClick={resetForm} className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-3 py-1 text-xs font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Category list */}
      <div className="space-y-1">
        {allCategories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center gap-2 rounded-[var(--app-radius-element)] px-2.5 py-2 hover:bg-[var(--app-color-surface-hover)]"
          >
            <span className="flex-1 truncate text-sm text-[var(--app-color-text-primary)]">{cat.name}</span>
            <span className="text-[11px] text-[var(--app-color-text-tertiary)]">{cat.pageCount} 篇</span>
            <button
              onClick={() => startEdit(cat)}
              className="rounded p-1 text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-container)] hover:text-[var(--app-color-text-primary)]"
            >
              <Pencil className="size-3" />
            </button>
            <button
              onClick={() => { if (confirm(`确定删除 ${cat.name} 吗？`)) deleteMutation.mutate(cat.id); }}
              disabled={cat.pageCount > 0}
              className="rounded p-1 text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-feedback-danger-soft)] hover:text-[var(--app-color-feedback-danger)] disabled:opacity-30"
              title={cat.pageCount > 0 ? "该分类下有文档，无法删除" : "删除分类"}
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
        {allCategories.length === 0 && !isLoading && (
          <p className="py-4 text-center text-sm text-[var(--app-color-text-tertiary)]">暂无分类</p>
        )}
      </div>
    </div>
  );
}
