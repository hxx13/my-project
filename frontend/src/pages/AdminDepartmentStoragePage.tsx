import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import {
  fetchDahuaDepartments,
  refreshDahuaDepartments,
  type DahuaDepartmentRow,
} from "@/api/twinApi";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import DataSkeleton from "@/components/ui/DataSkeleton";

type TreeRow = DahuaDepartmentRow & { depth: number };

export default function AdminDepartmentStoragePage() {
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["dahuaDepartments", appliedKeyword] as const,
    queryFn: () => fetchDahuaDepartments(1, 2000, appliedKeyword).then((d) => d.list || []),
    placeholderData: (prev) => prev,
  });

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
      <h2 className="text-lg font-semibold text-[var(--twin-ink)]">部门落库信息（结构树）</h2>
      <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 space-y-3 shadow-twin-level-1">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按部门名/departmentSn/ID检索"
            className="w-full max-w-md rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
          />
          <button
            className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]"
            onClick={() => setAppliedKeyword(keyword.trim())}
          >
            查询
          </button>
          <button
            className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]"
            onClick={async () => {
              try {
                await refreshDahuaDepartments();
                toast.success("部门缓存刷新完成");
                setKeyword("");
                setAppliedKeyword("");
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
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">部门名称（树）</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">parentId</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">departmentSn</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {treeRows.map((r) => (
                  <tr key={r.id}>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.id}</td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2 text-[var(--twin-ink)]">
                      <span style={{ marginLeft: `${r.depth * 16}px` }}>
                        {r.depth > 0 ? "└ " : ""}{r.name || "-"}
                      </span>
                    </td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.parentId ?? "-"}</td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.departmentSn || "-"}</td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.updatedAt || "-"}</td>
                  </tr>
                ))}
                {treeRows.length === 0 && (
                  <tr>
                    <td className="border border-[var(--twin-hairline)] px-2 py-4 text-center text-[var(--twin-mute)]" colSpan={5}>
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
