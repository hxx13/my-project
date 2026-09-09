import { useCallback, useEffect, useState } from "react";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import { deleteCardArchive, downloadBlob, downloadCardArchive, fetchCardArchives } from "@/api/domains/cardPrint.api";
import type { CardArchive } from "../types";

const PAGE_SIZE = 20;

const BTN_PRIMARY =
  "rounded-twin-md bg-[var(--twin-link-deep)] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50";
const BTN_OUTLINE =
  "rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-[12px] text-[var(--twin-ink)] transition hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50";

export function CardArchivePanel() {
  const [rows, setRows] = useState<CardArchive[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCardArchives(page, PAGE_SIZE);
      const list = res?.rows ?? [];
      if (list.length === 0 && page > 1) {
        // 删除后页数变少导致越界：回退一页，page 变化会触发重新加载
        setPage((p) => Math.max(1, p - 1));
        return;
      }
      setRows(list);
      setTotal(res?.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载归档失败");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (id: number) => {
    if (!window.confirm("删除该归档及其 PDF 文件？")) return;
    try {
      await deleteCardArchive(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const fmtSize = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminTableShell loading={loading} error={error} onRetry={load} empty={rows.length === 0}
        emptyMessage="还没有生成过卡牌" scrollable>
        <table className="twin-table w-full text-[13px]">
          <thead>
            <tr>
              <th>模板</th><th>页数</th><th>文件名</th><th>大小</th><th>生成人</th><th>时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{a.templateName}</td>
                <td>{a.pageCount}</td>
                <td>{a.fileName}</td>
                <td>{fmtSize(a.fileSize)}</td>
                <td>{a.createdBy ?? "-"}</td>
                <td>{a.createdAt}</td>
                <td>
                  <div className="flex gap-2">
                    <button type="button" className={BTN_OUTLINE}
                      onClick={async () => {
                        try {
                          downloadBlob(await downloadCardArchive(a.id), a.fileName);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "下载失败");
                        }
                      }}>
                      下载
                    </button>
                    <button type="button" className={BTN_OUTLINE} onClick={() => remove(a.id)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
      <div className="mt-2 flex shrink-0 items-center gap-2 text-[13px]">
        <button type="button" className={BTN_OUTLINE} disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</button>
        <span>{page} / {totalPages}</span>
        <button type="button" className={BTN_OUTLINE} disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}>下一页</button>
      </div>
    </div>
  );
}
