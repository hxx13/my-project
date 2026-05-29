import { useState } from "react";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import {
  fetchDahuaDoorGroups,
  refreshDahuaDoorGroups,
  type DahuaDoorGroupRow,
} from "@/api/twinApi";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import DataSkeleton from "@/components/ui/DataSkeleton";

export default function AdminDoorGroupStoragePage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["dahuaDoorGroups", page, pageSize, appliedKeyword] as const,
    queryFn: () => fetchDahuaDoorGroups(page, pageSize, appliedKeyword),
    placeholderData: (prev) => prev,
  });

  const rows: DahuaDoorGroupRow[] = data?.list ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--twin-ink)]">门组落库信息</h2>
      <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 space-y-3 shadow-twin-level-1">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按门组名/orgCode/orgName检索"
            className="w-full max-w-md rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
          />
          <button
            className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]"
            onClick={() => {
              setAppliedKeyword(keyword.trim());
              setPage(1);
            }}
          >
            查询
          </button>
          <button
            className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]"
            onClick={async () => {
              try {
                await refreshDahuaDoorGroups();
                toast.success("门组缓存刷新完成");
                setPage(1);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "刷新失败");
              }
            }}
          >
            刷新缓存
          </button>
        </div>

        {isLoading ? (
          <DataSkeleton variant="table" rows={6} />
        ) : (
          <AdminDataTableWrap scrollable>
            <table className="min-w-full border border-[var(--twin-hairline)] text-sm">
              <thead className="bg-[var(--twin-canvas-soft)]">
                <tr>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">ID</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">名称</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">orgCode</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">orgName</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">有无通道</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">备注</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.id}</td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2 text-[var(--twin-ink)]">{r.name || "-"}</td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.orgCode || "-"}</td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.orgName || "-"}</td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.hasChildChannel === 1 ? "是" : "否"}</td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.memo || "-"}</td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.updatedAt || "-"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="border border-[var(--twin-hairline)] px-2 py-4 text-center text-[var(--twin-mute)]" colSpan={7}>
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </AdminDataTableWrap>
        )}

        <div className="flex items-center justify-end gap-3 text-sm text-[var(--twin-body)]">
          <button
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span>
            第 {page} / {totalPages} 页（总数 {total}）
          </span>
          <button
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
