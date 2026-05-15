import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  fetchDahuaDepartments,
  refreshDahuaDepartments,
  type DahuaDepartmentRow,
} from "@/api/twinApi";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";

type TreeRow = DahuaDepartmentRow & { depth: number };

export default function AdminDepartmentStoragePage() {
  const [rows, setRows] = useState<DahuaDepartmentRow[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async (kw: string) => {
    setLoading(true);
    try {
      const data = await fetchDahuaDepartments(1, 2000, kw);
      setRows(data.list || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载部门缓存失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load("");
  }, []);

  const treeRows = useMemo(() => {
    if (!rows.length) return [] as TreeRow[];
    const byParent = new Map<number, DahuaDepartmentRow[]>();
    const idSet = new Set(rows.map((r) => Number(r.id)));
    rows.forEach((r) => {
      const pid = r.parentId == null ? 0 : Number(r.parentId);
      const list = byParent.get(pid) || [];
      list.push(r);
      byParent.set(pid, list);
    });
    byParent.forEach((arr) => arr.sort((a, b) => Number(a.id) - Number(b.id)));
    const roots = rows.filter((r) => {
      const pid = r.parentId == null ? 0 : Number(r.parentId);
      return pid === 0 || !idSet.has(pid);
    }).sort((a, b) => Number(a.id) - Number(b.id));

    const out: TreeRow[] = [];
    const walk = (node: DahuaDepartmentRow, depth: number) => {
      out.push({ ...node, depth });
      const children = byParent.get(Number(node.id)) || [];
      children.forEach((child) => walk(child, depth + 1));
    };
    roots.forEach((r) => walk(r, 0));
    return out;
  }, [rows]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">部门落库信息（结构树）</h2>
      <div className="rounded border bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按部门名/departmentSn/ID检索"
            className="w-full max-w-md rounded border px-3 py-2 text-sm"
          />
          <button
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white"
            onClick={() => void load(keyword.trim())}
          >
            查询
          </button>
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={async () => {
              try {
                await refreshDahuaDepartments();
                toast.success("部门缓存刷新完成");
                await load(keyword.trim());
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
                  <th className="border px-2 py-2 text-left">部门名称（树）</th>
                  <th className="border px-2 py-2 text-left">parentId</th>
                  <th className="border px-2 py-2 text-left">departmentSn</th>
                  <th className="border px-2 py-2 text-left">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {treeRows.map((r) => (
                  <tr key={r.id}>
                    <td className="border px-2 py-2">{r.id}</td>
                    <td className="border px-2 py-2">
                      <span style={{ marginLeft: `${r.depth * 16}px` }}>
                        {r.depth > 0 ? "└ " : ""}{r.name || "-"}
                      </span>
                    </td>
                    <td className="border px-2 py-2">{r.parentId ?? "-"}</td>
                    <td className="border px-2 py-2">{r.departmentSn || "-"}</td>
                    <td className="border px-2 py-2">{r.updatedAt || "-"}</td>
                  </tr>
                ))}
                {treeRows.length === 0 && (
                  <tr>
                    <td className="border px-2 py-4 text-center text-slate-500" colSpan={5}>
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </AdminDataTableWrap>
        )}
      </div>
    </div>
  );
}
