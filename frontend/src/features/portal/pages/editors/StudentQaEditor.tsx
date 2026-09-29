import { useCallback, useEffect, useMemo, useState } from "react";
import { HelpCircle, Plus, Trash2 } from "lucide-react";
import { useAdminContents, useCreateContent, useUpdateContent } from "@/api/hooks/usePortalContent";
import { portalExtension } from "@/features/portal/noticePriority";
import type { PortalContentView } from "@/api/domains/portalContent.api";
import { AdminButton } from "@/components/admin/AdminButton";
import EmptyState from "@/components/ui/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface QaItem { question: string; answer: string }
interface QaGroup { category: string; items: QaItem[] }

function parseExt(row: PortalContentView): Record<string, unknown> {
  return portalExtension(row);
}

function toGroups(ext: Record<string, unknown>): QaGroup[] {
  if (Array.isArray(ext.groups)) {
    return (ext.groups as unknown[]).map((g) => {
      const gg = g as Record<string, unknown>;
      const items = Array.isArray(gg.items)
        ? (gg.items as unknown[]).map((it) => {
            const ii = it as Record<string, unknown>;
            return { question: String(ii.question ?? ""), answer: String(ii.answer ?? "") };
          })
        : [];
      return { category: String(gg.category ?? ""), items };
    });
  }
  return [];
}

const cloneGroup = (g: QaGroup): QaGroup => ({
  category: g.category,
  items: g.items.map((it) => ({ ...it })),
});

const fieldInput =
  "w-full rounded-[var(--admin-radius-md)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)] focus-visible:border-ring";

export default function StudentQaEditor() {
  const { data, isFetching } = useAdminContents({ type: "PAGE", size: 50 });
  const createMut = useCreateContent();
  const updateMut = useUpdateContent();

  const row = useMemo(() => {
    const list = (data?.data ?? []).filter((r) => parseExt(r).page_key === "student_faq");
    list.sort((a, b) => {
      if (a.status === "PUBLISHED" && b.status !== "PUBLISHED") return -1;
      if (b.status === "PUBLISHED" && a.status !== "PUBLISHED") return 1;
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
    return list[0] ?? null;
  }, [data]);

  const [groups, setGroups] = useState<QaGroup[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftGroup, setDraftGroup] = useState<QaGroup>({ category: "", items: [] });

  useEffect(() => {
    if (row) setGroups(toGroups(parseExt(row)));
    else if (!isFetching) setGroups([]);
  }, [row?.id, isFetching]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => {
    setEditingIndex(null);
    setDraftGroup({ category: "", items: [{ question: "", answer: "" }] });
    setModalOpen(true);
  };

  const openEdit = (i: number) => {
    setEditingIndex(i);
    setDraftGroup(cloneGroup(groups[i]));
    setModalOpen(true);
  };

  const confirmModal = () => {
    if (editingIndex === null) setGroups([...groups, draftGroup]);
    else {
      const n = [...groups];
      n[editingIndex] = draftGroup;
      setGroups(n);
    }
    setModalOpen(false);
  };

  const removeGroup = (i: number) => setGroups(groups.filter((_, j) => j !== i));

  const setDraftCategory = (v: string) => setDraftGroup({ ...draftGroup, category: v });
  const setDraftItem = (ii: number, patch: Partial<QaItem>) => {
    const items = draftGroup.items.map((it, j) => (j === ii ? { ...it, ...patch } : it));
    setDraftGroup({ ...draftGroup, items });
  };
  const addDraftItem = () => setDraftGroup({ ...draftGroup, items: [...draftGroup.items, { question: "", answer: "" }] });
  const removeDraftItem = (ii: number) => setDraftGroup({ ...draftGroup, items: draftGroup.items.filter((_, j) => j !== ii) });

  const save = useCallback(() => {
    const ext = { page_key: "student_faq", groups };
    if (row) {
      updateMut.mutate({
        id: row.id,
        body: { title: row.title || "学生Q&A", summary: "学生常见问题", extensionJson: ext, status: "PUBLISHED" },
      });
    } else {
      createMut.mutate({
        contentType: "PAGE",
        title: "学生Q&A",
        summary: "学生常见问题",
        extensionJson: ext,
        status: "PUBLISHED",
      });
    }
  }, [row, groups, createMut, updateMut]);

  const pending = createMut.isPending || updateMut.isPending;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--app-color-text-primary)]">学生Q&A</h1>
          <p className="mt-0.5 text-xs text-[var(--app-color-text-tertiary)]">
            管理学生端「常见问题」内容。改完要点右上角「保存并发布」，学生端才会看到。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AdminButton tone="secondary" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            新建分组
          </AdminButton>
          <AdminButton tone="primary" onClick={save} loading={pending}>
            保存并发布
          </AdminButton>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="twin-table">
            <thead>
              <tr>
                <th>分组</th>
                <th className="w-[110px] text-right">问答数</th>
                <th className="w-[170px] text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, i) => (
                <tr key={i}>
                  <td className="font-medium text-[var(--app-color-text-primary)]">
                    {g.category || <span className="text-[var(--app-color-text-tertiary)]">未命名分组</span>}
                  </td>
                  <td className="text-right tabular-nums text-xs">{g.items.length} 条</td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <AdminButton tone="ghost" className="h-7 px-2.5 text-xs" onClick={() => openEdit(i)}>
                        编辑
                      </AdminButton>
                      <AdminButton tone="destructive" className="h-7 px-2.5 text-xs" onClick={() => removeGroup(i)}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        删除
                      </AdminButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {groups.length === 0 && !isFetching ? (
            <EmptyState
              icon={HelpCircle}
              title="还没有问答分组"
              description="点右上角「新建分组」，把学生常见问题按类别整理进去。"
              className="m-4"
            />
          ) : null}
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingIndex === null ? "新建分组" : "编辑分组"}</DialogTitle>
            <DialogDescription>分组名会作为学生端手风琴的小标题。</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--app-color-text-secondary)]">分组名称</span>
              <input
                className={fieldInput}
                placeholder="如：门禁与进出"
                value={draftGroup.category}
                onChange={(e) => setDraftCategory(e.target.value)}
              />
            </label>

            <div className="text-xs font-medium text-[var(--app-color-text-secondary)]">
              问答条目（{draftGroup.items.length} 条）
            </div>

            {draftGroup.items.map((item, ii) => (
              <div
                key={ii}
                className="space-y-2 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[11px] font-medium text-[var(--app-color-text-tertiary)]">
                    问答 {ii + 1}
                  </span>
                  {draftGroup.items.length > 1 ? (
                    <AdminButton tone="destructive" className="h-6 px-2 text-[11px]" onClick={() => removeDraftItem(ii)}>
                      删除
                    </AdminButton>
                  ) : null}
                </div>
                <input
                  className={fieldInput}
                  placeholder="问题"
                  value={item.question}
                  onChange={(e) => setDraftItem(ii, { question: e.target.value })}
                />
                <textarea
                  className={`${fieldInput} min-h-14 resize-y`}
                  placeholder="答案"
                  value={item.answer}
                  onChange={(e) => setDraftItem(ii, { answer: e.target.value })}
                />
              </div>
            ))}

            <AdminButton tone="ghost" className="h-7 px-2 text-xs" onClick={addDraftItem}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              添加问答
            </AdminButton>
          </div>

          <DialogFooter>
            <AdminButton tone="ghost" onClick={() => setModalOpen(false)}>
              取消
            </AdminButton>
            <AdminButton tone="primary" onClick={confirmModal}>
              确定
            </AdminButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
