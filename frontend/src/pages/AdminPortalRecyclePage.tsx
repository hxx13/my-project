import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { RotateCcw, Trash2 } from "lucide-react";
import { purgeContent, restoreContent } from "@/api/domains/portalContent.api";
import { useRecycleContents } from "@/api/hooks/usePortalContent";
import { portalContentQueryKeys } from "@/api/hooks/queryKeys";
import { dateOnly } from "@/utils/beijingTime";
import { AdminBatchBar } from "@/components/admin/AdminBatchBar";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminPagination } from "@/components/admin/AdminPagination";
import EmptyState from "@/components/ui/EmptyState";

import { appConfirm } from "@/lib/appDialog";

const TYPE_LABEL: Record<string, string> = {
  NEWS: "科研文章",
  NOTICE: "通知公告",
  MODEL_RESOURCE: "模型资源",
  PAGE: "页面",
};

export default function AdminPortalRecyclePage() {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data, isFetching } = useRecycleContents({ page, size });
  const qc = useQueryClient();

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const clearSelection = () => setSelected(new Set());
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const refresh = () => qc.invalidateQueries({ queryKey: portalContentQueryKeys.all });

  const runBatch = async (ids: number[], fn: (id: number) => Promise<unknown>, okMsg: string) => {
    const results = await Promise.allSettled(ids.map(fn));
    const failed = results.filter((r) => r.status === "rejected").length;
    refresh();
    clearSelection();
    if (failed === 0) toast.success(okMsg);
    else if (failed === ids.length) toast.error("操作失败，请重试");
    else toast.error(`${failed} 条失败，其余已处理`);
  };

  const restore = async (id: number, title: string) => {
    if (!(await appConfirm(`恢复「${title}」？恢复后回到内容列表，状态保持删除前的样子。`))) return;
    await restoreContent(id);
    refresh();
    toast.success("已恢复");
  };

  const purge = async (id: number, title: string) => {
    if (!(await appConfirm(`彻底删除「${title}」？此操作不可恢复。`))) return;
    await purgeContent(id);
    refresh();
    toast.success("已彻底删除");
  };

  const batchIds = [...selected];
  const batchRestore = async () => {
    if (!(await appConfirm(`恢复选中的 ${batchIds.length} 条？`))) return;
    void runBatch(batchIds, (id) => restoreContent(id), "已恢复");
  };
  const batchPurge = async () => {
    if (!(await appConfirm(`彻底删除选中的 ${batchIds.length} 条？此操作不可恢复。`))) return;
    void runBatch(batchIds, (id) => purgeContent(id), "已彻底删除");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--app-color-text-primary)]">回收站</h1>
          <p className="mt-0.5 text-xs text-[var(--app-color-text-tertiary)]">
            共 {total} 条 · 删除的内容会一直留在这里，不会自动清理，需要时手动「彻底删除」
          </p>
        </div>
      </div>

      <AdminBatchBar count={selected.size} onClear={clearSelection} className="shrink-0">
        <AdminButton tone="ghost" className="h-7 px-2 text-xs" onClick={() => void batchRestore()}>
          批量恢复
        </AdminButton>
        <AdminButton tone="destructive" className="h-7 px-2 text-xs" onClick={() => void batchPurge()}>
          批量彻底删除
        </AdminButton>
      </AdminBatchBar>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="twin-table">
            <thead>
              <tr>
                <th className="w-[38px]">
                  <input
                    type="checkbox"
                    aria-label="全选本页"
                    checked={allChecked}
                    onChange={toggleAll}
                    disabled={rows.length === 0}
                  />
                </th>
                <th className="w-[64px]">ID</th>
                <th>标题</th>
                <th className="w-[92px]">类型</th>
                <th className="w-[110px]">删除时间</th>
                <th className="w-[190px] text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`选择 ${row.title}`}
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                    />
                  </td>
                  <td className="font-mono text-xs text-[var(--app-color-text-tertiary)]">#{row.id}</td>
                  <td className="max-w-0">
                    <div className="truncate font-medium text-[var(--app-color-text-primary)]" title={row.title}>
                      {row.title}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center rounded-md border border-[var(--app-color-border-default)] px-2 py-0.5 text-[11px] text-[var(--app-color-text-secondary)]">
                      {TYPE_LABEL[row.contentType] ?? row.contentType}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-xs tabular-nums">{dateOnly(row.updatedAt)}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <AdminButton
                        tone="ghost"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => void restore(row.id, row.title)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        恢复
                      </AdminButton>
                      <AdminButton
                        tone="destructive"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => void purge(row.id, row.title)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        彻底删除
                      </AdminButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length === 0 && !isFetching ? (
            <EmptyState
              icon={Trash2}
              title="回收站是空的"
              description="删除的内容会先放到这里，可以恢复。"
              className="m-4"
            />
          ) : null}
        </div>

        <AdminPagination
          className="shrink-0 border-t border-[var(--app-color-border-default)] px-4 py-2.5"
          total={total}
          page={page}
          size={size}
          onPageChange={setPage}
          onSizeChange={(s) => {
            setSize(s);
            setPage(1);
            clearSelection();
          }}
        />
      </div>
    </div>
  );
}
