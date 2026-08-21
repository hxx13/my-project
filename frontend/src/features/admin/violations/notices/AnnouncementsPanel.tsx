import { useCallback, useMemo, useRef, useState } from "react";
import type { DragEvent, JSX } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Settings2, Trash2 } from "lucide-react";
import {
  deleteScanPopupAnnouncement,
  listScanPopupAnnouncements,
  updateScanPopupAnnouncement,
  type ScanPopupAnnouncementRow,
} from "@/api/domains/scanPopupAnnouncement.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";
import { ListPageLayout } from "../shared/ListPageLayout";
import { AnnouncementEditor } from "./AnnouncementEditor";
import { AnnouncementSettingsView } from "./AnnouncementSettingsView";
import { getTimeStatus, TIME_STATUS_META } from "./announcementTimeStatus";

import { appConfirm } from "@/lib/appDialog";
type AnnouncementView = { kind: "list" } | { kind: "edit"; id: number } | { kind: "create" } | { kind: "settings" };

export function AnnouncementsPanel(): JSX.Element {
  const qc = useQueryClient();
  const [view, setView] = useState<AnnouncementView>({ kind: "list" });
  const [search, setSearch] = useState("");
  const [editingSortId, setEditingSortId] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["scanPopupAnnouncements"],
    queryFn: listScanPopupAnnouncements,
  });
  const searching = search.trim().length > 0;

  const sorted = useMemo(() => [...rows].sort((a, b) => (b.sortOrder ?? 0) - (a.sortOrder ?? 0)), [rows]);
  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return kw ? sorted.filter((r) => r.title.toLowerCase().includes(kw)) : sorted;
  }, [sorted, search]);
  const enabled = useMemo(() => filtered.filter((r) => r.enabled !== false), [filtered]);
  const disabled = useMemo(() => filtered.filter((r) => r.enabled === false), [filtered]);

  const persistReorder = useCallback(
    async (next: ScanPopupAnnouncementRow[]) => {
      const reordered = next.map((x, i) => ({ ...x, sortOrder: next.length - i }));
      const orderById = new Map(reordered.map((x) => [x.id, x.sortOrder ?? 0]));
      qc.setQueryData<ScanPopupAnnouncementRow[]>(["scanPopupAnnouncements"], (prev) =>
        (prev ?? []).map((x) => (orderById.has(x.id) ? { ...x, sortOrder: orderById.get(x.id) } : x))
      );
      try {
        await Promise.all(
          reordered.map((x) =>
            updateScanPopupAnnouncement(x.id, {
              title: x.title,
              contentHtml: x.contentHtml ?? "",
              contentJson: x.contentJson ?? null,
              enabled: x.enabled !== false,
              sortOrder: x.sortOrder ?? 0,
              publishAt: x.publishAt ?? null,
              expireAt: x.expireAt ?? null,
              status: x.status ?? "ACTIVE",
            })
          )
        );
      } catch {
        void qc.invalidateQueries({ queryKey: ["scanPopupAnnouncements"] });
        throw new Error("排序保存失败");
      }
    },
    [qc]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (!await appConfirm("确定删除该公告？")) return;
      try {
        await deleteScanPopupAnnouncement(id);
        toast.success("已删除");
        qc.setQueryData<ScanPopupAnnouncementRow[]>(["scanPopupAnnouncements"], (prev) =>
          (prev ?? []).filter((r) => r.id !== id)
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "删除失败");
      }
    },
    [qc]
  );

  const commitSort = (id: number, val: string) => {
    setEditingSortId(null);
    if (searching) return;
    const n = parseInt(val, 10);
    if (!Number.isFinite(n) || n < 1 || n > enabled.length) return;
    const pos = enabled.findIndex((x) => x.id === id) + 1;
    if (n === pos) return;
    const list = [...enabled];
    const [item] = list.splice(pos - 1, 1);
    if (!item) return;
    list.splice(n - 1, 0, item);
    persistReorder(list).catch(() => toast.error("排序保存失败，请刷新"));
  };

  const handleDragStart = (i: number) => {
    dragIndexRef.current = i;
  };
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleDrop = (i: number) => {
    const src = dragIndexRef.current;
    dragIndexRef.current = null;
    if (searching || src == null || src === i) return;
    const list = [...enabled];
    const [dragged] = list.splice(src, 1);
    if (!dragged) return;
    list.splice(i, 0, dragged);
    persistReorder(list).catch(() => toast.error("排序保存失败，请刷新"));
  };
  const handleDragEnd = () => {
    dragIndexRef.current = null;
  };

  if (view.kind === "settings") return <AnnouncementSettingsView onBack={() => setView({ kind: "list" })} />;
  if (view.kind === "edit" || view.kind === "create") {
    return (
      <AnnouncementEditor
        id={view.kind === "edit" ? view.id : null}
        onDone={() => {
          setView({ kind: "list" });
          void qc.invalidateQueries({ queryKey: ["scanPopupAnnouncements"] });
        }}
        onCancel={() => setView({ kind: "list" })}
      />
    );
  }

  const toolbar = (
    <div className="flex items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-color-text-tertiary)]" />
        <input
          className="w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] py-2 pl-8 pr-3 text-sm text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)] placeholder:text-[var(--app-color-text-tertiary)]"
          placeholder="搜索公告标题…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <AdminButton type="button" tone="primary" size="sm" className="shrink-0" onClick={() => setView({ kind: "create" })}>
        <Plus className="h-4 w-4" /> 新建公告
      </AdminButton>
      <AdminButton type="button" tone="secondary" size="sm" className="shrink-0" onClick={() => setView({ kind: "settings" })}>
        <Settings2 className="h-4 w-4" /> 显示设置
      </AdminButton>
    </div>
  );

  const renderRow = (r: ScanPopupAnnouncementRow, pos: number, index: number) => {
    const sm = TIME_STATUS_META[getTimeStatus(r)];
    const drag = pos > 0 && !searching;
    return (
      <tr
        key={r.id}
        draggable={drag}
        title={drag ? "拖拽调整顺序" : undefined}
        onDragStart={drag ? () => handleDragStart(index) : undefined}
        onDragOver={drag ? handleDragOver : undefined}
        onDrop={drag ? () => handleDrop(index) : undefined}
        onDragEnd={drag ? handleDragEnd : undefined}
        className={cn(
          "border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]",
          drag && "cursor-grab active:cursor-grabbing"
        )}
      >
        <td className="w-16 px-3 py-2">
          {pos > 0 ? (
            searching ? (
              <span className="text-xs font-bold text-[var(--app-color-text-primary)]">{pos}</span>
            ) : editingSortId === r.id ? (
              <input
                autoFocus
                className="w-12 rounded border border-[var(--app-color-accent)] bg-[var(--app-color-surface-page)] px-1 py-0.5 text-center text-xs font-bold text-[var(--app-color-text-primary)] outline-none"
                defaultValue={String(pos)}
                onBlur={(e) => commitSort(r.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitSort(r.id, (e.target as HTMLInputElement).value);
                  if (e.key === "Escape") setEditingSortId(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="text-xs font-bold text-[var(--app-color-text-primary)] hover:text-[var(--app-color-accent)]"
                onClick={() => setEditingSortId(r.id)}
                title="点击修改排序"
              >
                {pos}
              </button>
            )
          ) : (
            <span className="text-xs text-[var(--app-color-text-tertiary)]">—</span>
          )}
        </td>
        <td className="max-w-[320px] truncate px-3 py-2 font-medium text-[var(--app-color-text-primary)]" title={r.title}>
          {r.title}
        </td>
        <td className="w-24 px-3 py-2">
          <span className={cn("inline-flex justify-center rounded-full border px-2 py-0.5 text-[11px] font-medium", sm.color)}>
            {sm.label}
          </span>
        </td>
        <td className="w-24 px-3 py-2">
          {(r.autoSuppressCount ?? 0) > 0 ? (
            <span className="text-xs font-medium text-[var(--app-color-feedback-warning)]">{r.autoSuppressCount} 人</span>
          ) : (
            <span className="text-xs text-[var(--app-color-text-tertiary)]">0 人</span>
          )}
        </td>
        <td className="w-28 px-3 py-2">
          <div className="flex items-center justify-end gap-1.5">
            <AdminButton type="button" tone="secondary" size="sm" className="gap-1" onClick={() => setView({ kind: "edit", id: r.id })}>
              <Pencil className="h-3.5 w-3.5" /> 编辑
            </AdminButton>
            <AdminButton type="button" tone="destructive" size="sm" className="gap-1" onClick={() => void handleDelete(r.id)}>
              <Trash2 className="h-3.5 w-3.5" /> 删除
            </AdminButton>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <ListPageLayout toolbar={toolbar}>
      <AdminTableShell loading={isLoading} empty={!isLoading && filtered.length === 0} emptyMessage="暂无公告">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="border-b-2 border-[var(--app-color-border-strong)]">
            <tr className="text-xs font-bold text-[var(--app-color-text-secondary)]">
              <th className="w-16 px-3 py-2">序号</th>
              <th className="px-3 py-2">标题</th>
              <th className="w-24 px-3 py-2">时间状态</th>
              <th className="w-24 px-3 py-2">不再弹出</th>
              <th className="w-28 px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {enabled.length > 0 && (
              <tr className="border-b border-[var(--app-color-border-strong)] bg-[var(--app-color-surface-hover)]">
                <td colSpan={5} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--app-color-text-tertiary)]">
                  已启用 · {enabled.length}
                </td>
              </tr>
            )}
            {enabled.map((r, i) => renderRow(r, i + 1, i))}
            {disabled.length > 0 && (
              <tr className="border-b border-[var(--app-color-border-strong)] bg-[var(--app-color-surface-hover)]">
                <td colSpan={5} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--app-color-text-tertiary)]">
                  未启用 · {disabled.length}
                </td>
              </tr>
            )}
            {disabled.map((r) => renderRow(r, 0, -1))}
          </tbody>
        </table>
      </AdminTableShell>
    </ListPageLayout>
  );
}
