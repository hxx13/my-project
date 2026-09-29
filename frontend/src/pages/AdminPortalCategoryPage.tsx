import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Check, Plus, Trash2, X } from "lucide-react";
import {
  createCategory,
  deleteCategory,
  fetchAdminCategories,
  updateCategory,
  type PortalCategory,
} from "@/api/domains/portalContent.api";
import { portalContentQueryKeys } from "@/api/hooks/queryKeys";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSelect } from "@/components/admin/AdminSelect";
import EmptyState from "@/components/ui/EmptyState";

import { appConfirm } from "@/lib/appDialog";

const SCOPE_LABELS: Record<string, string> = {
  NEWS: "科研文章",
  NOTICE: "通知公告",
  MODEL_RESOURCE: "模型资源",
  ALL: "通用",
};
const SCOPE_OPTIONS = ["MODEL_RESOURCE", "NEWS", "NOTICE", "ALL"] as const;

const cellInput =
  "h-7 w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 text-xs text-[var(--app-color-text-primary)] outline-none focus-visible:border-ring";

export default function AdminPortalCategoryPage() {
  const qc = useQueryClient();
  const { data: categories = [], isFetching } = useQuery({
    queryKey: portalContentQueryKeys.categories("admin"),
    queryFn: fetchAdminCategories,
  });

  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<string>("MODEL_RESOURCE");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editScope, setEditScope] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: portalContentQueryKeys.all });

  const createMut = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      invalidate();
      setNewName("");
      toast.success("分类已创建");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updateCategory>[1] }) => updateCategory(id, body),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      toast.success("已保存");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      invalidate();
      toast.success("已删除");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitNew = () => {
    const name = newName.trim();
    if (!name) return;
    createMut.mutate({ name, scope: newScope });
  };

  const startEdit = (cat: PortalCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditScope(cat.scope);
  };

  const remove = async (cat: PortalCategory) => {
    const used = cat.contentCount ?? 0;
    const hint = used > 0
      ? `「${cat.name}」下面还有 ${used} 条内容，删除分类不会删内容，它们会变成未分类。确定删除？`
      : `删除「${cat.name}」？`;
    if (!(await appConfirm(hint))) return;
    deleteMut.mutate(cat.id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
      {/* 页头 */}
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--app-color-text-primary)]">分类管理</h1>
          <p className="mt-0.5 text-xs text-[var(--app-color-text-tertiary)]">共 {categories.length} 个分类</p>
        </div>
      </div>

      {/* 新建行 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3.5 py-2.5">
        <input
          className="h-[var(--admin-control-height)] min-w-0 flex-1 rounded-[var(--admin-radius-md)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 text-sm text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)] focus-visible:border-ring"
          placeholder="新分类名称"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitNew();
          }}
        />
        <AdminSelect
          className="h-[var(--admin-control-height)] text-sm"
          aria-label="作用域"
          value={newScope}
          onChange={(e) => setNewScope(e.target.value)}
        >
          {SCOPE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {SCOPE_LABELS[s]}
            </option>
          ))}
        </AdminSelect>
        <AdminButton tone="primary" onClick={submitNew} disabled={!newName.trim() || createMut.isPending}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          新建
        </AdminButton>
      </div>

      {/* 列表 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="twin-table">
            <thead>
              <tr>
                <th>分类名称</th>
                <th className="w-[140px]">作用域</th>
                <th className="w-[110px] text-right">内容数</th>
                <th className="w-[170px] text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const editing = editingId === cat.id;
                return (
                  <tr key={cat.id}>
                    <td>
                      {editing ? (
                        <input className={cellInput} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                      ) : (
                        <span className="font-medium text-[var(--app-color-text-primary)]">{cat.name}</span>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <AdminSelect className="h-7 text-xs" value={editScope} onChange={(e) => setEditScope(e.target.value)}>
                          {SCOPE_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {SCOPE_LABELS[s]}
                            </option>
                          ))}
                        </AdminSelect>
                      ) : (
                        <span className="inline-flex items-center rounded-md border border-[var(--app-color-border-default)] px-2 py-0.5 text-[11px] text-[var(--app-color-text-secondary)]">
                          {SCOPE_LABELS[cat.scope] || cat.scope}
                        </span>
                      )}
                    </td>
                    <td className="text-right tabular-nums text-xs">
                      {cat.contentCount === undefined ? "—" : cat.contentCount}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {editing ? (
                          <>
                            <AdminButton
                              tone="primary"
                              className="h-7 px-2.5 text-xs"
                              loading={updateMut.isPending}
                              onClick={() => updateMut.mutate({ id: cat.id, body: { name: editName, scope: editScope } })}
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              保存
                            </AdminButton>
                            <AdminButton tone="ghost" className="h-7 px-2.5 text-xs" onClick={() => setEditingId(null)}>
                              <X className="h-3.5 w-3.5" aria-hidden />
                              取消
                            </AdminButton>
                          </>
                        ) : (
                          <>
                            <AdminButton tone="ghost" className="h-7 px-2.5 text-xs" onClick={() => startEdit(cat)}>
                              编辑
                            </AdminButton>
                            <AdminButton tone="destructive" className="h-7 px-2.5 text-xs" onClick={() => void remove(cat)}>
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              删除
                            </AdminButton>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {categories.length === 0 && !isFetching ? (
            <EmptyState
              icon={Plus}
              title="还没有分类"
              description="在上面输入名称，选好作用域，点「新建」。"
              className="m-4"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
