import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  fetchDahuaDoorGroups,
  refreshDahuaDoorGroups,
  type DahuaDoorGroupRow,
} from "@/api/twinApi";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";

export default function AdminDoorGroupStoragePage() {
  const [rows, setRows] = useState<DahuaDoorGroupRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async (pageNo: number, kw: string) => {
    setLoading(true);
    try {
      const data = await fetchDahuaDoorGroups(pageNo, pageSize, kw);
      setRows(data.list || []);
      setTotal(data.total || 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载门组缓存失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(page, keyword);
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">门组落库信息</h2>
      <div className="rounded border bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按门组名/orgCode/orgName检索"
            className="w-full max-w-md rounded border px-3 py-2 text-sm"
          />
          <button
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white"
            onClick={() => {
              setPage(1);
              void load(1, keyword.trim());
            }}
          >
            查询
          </button>
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={async () => {
              try {
                await refreshDahuaDoorGroups();
                toast.success("门组缓存刷新完成");
                await load(page, keyword.trim());
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "刷新失败");
              }
            }}
          >
            刷新缓存
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-slate-500">加载中...</div>
        ) : (
          <AdminDataTableWrap scrollable>
            <table className="min-w-full border text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="border px-2 py-2 text-left">ID</th>
                  <th className="border px-2 py-2 text-left">名称</th>
                  <th className="border px-2 py-2 text-left">orgCode</th>
                  <th className="border px-2 py-2 text-left">orgName</th>
                  <th className="border px-2 py-2 text-left">有无通道</th>
                  <th className="border px-2 py-2 text-left">备注</th>
                  <th className="border px-2 py-2 text-left">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="border px-2 py-2">{r.id}</td>
                    <td className="border px-2 py-2">{r.name || "-"}</td>
                    <td className="border px-2 py-2">{r.orgCode || "-"}</td>
                    <td className="border px-2 py-2">{r.orgName || "-"}</td>
                    <td className="border px-2 py-2">{r.hasChildChannel === 1 ? "是" : "否"}</td>
                    <td className="border px-2 py-2">{r.memo || "-"}</td>
                    <td className="border px-2 py-2">{r.updatedAt || "-"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="border px-2 py-4 text-center text-slate-500" colSpan={7}>
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </AdminDataTableWrap>
        )}

        <div className="flex items-center justify-end gap-3 text-sm">
          <button
            className="rounded border px-3 py-1 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span>
            第 {page} / {totalPages} 页（总数 {total}）
          </span>
          <button
            className="rounded border px-3 py-1 disabled:opacity-40"
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
