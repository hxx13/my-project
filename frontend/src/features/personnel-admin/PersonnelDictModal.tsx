import { useState, useCallback, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Portal } from "@/components/Portal";
import { fetchDepartments, fetchProjectGroups, updateDepartment, updateProjectGroup, type DepartmentDict, type ProjectGroupDict } from "@/api/domains/admin.api";

/** 人员字典配置弹窗：部门（=院校，含校内/校外归属）+ 课题组（归部门） */
export function PersonnelDictModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"dept" | "group">("dept");
  const [depts, setDepts] = useState<DepartmentDict[]>([]);
  const [groups, setGroups] = useState<ProjectGroupDict[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, g] = await Promise.all([fetchDepartments(), fetchProjectGroups()]);
      setDepts(d);
      setGroups(g);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载字典失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-5" onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between border-b border-[var(--twin-hairline)] pb-3">
            <h3 className="text-base font-semibold text-[var(--twin-ink)]">人员字典配置</h3>
            <button type="button" onClick={onClose} className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]">关闭</button>
          </div>

          <div className="mb-4 flex gap-1 border-b border-[var(--twin-hairline)]">
            <button type="button" onClick={() => setTab("dept")} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "dept" ? "border-[var(--twin-primary)] text-[var(--twin-primary)]" : "border-transparent text-[var(--twin-mute)]"}`}>
              部门（院校）
            </button>
            <button type="button" onClick={() => setTab("group")} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "group" ? "border-[var(--twin-primary)] text-[var(--twin-primary)]" : "border-transparent text-[var(--twin-mute)]"}`}>
              课题组
            </button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-[var(--twin-mute)]">加载中…</div>
          ) : tab === "dept" ? (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--twin-hairline)] text-[var(--twin-mute)]">
                <tr>
                  <th className="py-2 font-medium">部门名称</th>
                  <th className="py-2 font-medium">校内/校外</th>
                  <th className="py-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.id} className="border-b border-[var(--twin-hairline)]">
                    <td className="py-1.5 text-[var(--twin-body)]">{d.name}</td>
                    <td className="py-1.5">
                      <select
                        value={d.isSchool == null ? "" : String(d.isSchool)}
                        onChange={async (e) => {
                          const v = e.target.value;
                          if (v === "") return;
                          try { await updateDepartment(d.id, { isSchool: Number(v) }); toast.success("已更新"); } catch (err) { toast.error(err instanceof Error ? err.message : "更新失败"); }
                        }}
                        className="h-7 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 text-[11px] text-[var(--twin-body)]"
                      >
                        <option value="">未定</option>
                        <option value="1">校内</option>
                        <option value="0">校外</option>
                      </select>
                    </td>
                    <td className="py-1.5">
                      <span className={`text-[11px] ${d.active === 0 ? "text-rose-600" : "text-emerald-600"}`}>{d.active === 0 ? "停用" : "启用"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--twin-hairline)] text-[var(--twin-mute)]">
                <tr>
                  <th className="py-2 font-medium">课题组名称</th>
                  <th className="py-2 font-medium">归属部门</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} className="border-b border-[var(--twin-hairline)]">
                    <td className="py-1.5 text-[var(--twin-body)]">{g.name}</td>
                    <td className="py-1.5">
                      <select
                        value={g.departmentId == null ? "" : String(g.departmentId)}
                        onChange={async (e) => {
                          const v = e.target.value;
                          if (v === "") return;
                          try { await updateProjectGroup(g.id, { departmentId: Number(v) }); toast.success("已更新"); } catch (err) { toast.error(err instanceof Error ? err.message : "更新失败"); }
                        }}
                        className="h-7 max-w-[16rem] rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 text-[11px] text-[var(--twin-body)]"
                      >
                        <option value="">未归属</option>
                        {depts.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Portal>
  );
}
