import { useState, useCallback, useEffect } from "react";
import { toast } from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Portal } from "@/components/Portal";
import { AdminButton } from "@/components/admin/AdminButton";
import { queryKeys } from "@/api/hooks/queryKeys";
import {
  fetchDepartments, fetchProjectGroups, updateDepartment, updateProjectGroup,
  createDepartment, renameDepartment, deleteDepartment,
  createProjectGroup, renameProjectGroup, deleteProjectGroup,
  type DepartmentDict, type ProjectGroupDict,
} from "@/api/domains/admin.api";

const inkBtn = "inline-flex shrink-0 items-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--twin-body)] shadow-sm hover:bg-[var(--twin-canvas-soft)]";

/** 人员字典配置弹窗：部门（=院校，含校内/校外归属）+ 课题组（归部门）。仅 SUPER_ADMIN 打开。 */
export function PersonnelDictModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"dept" | "group">("dept");
  const [depts, setDepts] = useState<DepartmentDict[]>([]);
  const [groups, setGroups] = useState<ProjectGroupDict[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [deptEditId, setDeptEditId] = useState<number | null>(null);
  const [deptEditName, setDeptEditName] = useState("");
  const [groupEditId, setGroupEditId] = useState<number | null>(null);
  const [groupEditName, setGroupEditName] = useState("");

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

  // 改名/新建后让人员列表的部门/课题组显示跟着刷新
  const refreshPersonnel = () => qc.invalidateQueries({ queryKey: queryKeys.personnel.all });

  const createDept = async () => {
    const name = newName.trim();
    if (!name) { toast.error("请填写部门名称"); return; }
    try { await createDepartment(name); toast.success("已新建部门"); setNewName(""); await load(); refreshPersonnel(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "新建失败"); }
  };

  const createGroup = async () => {
    const name = newName.trim();
    if (!name) { toast.error("请填写课题组名称"); return; }
    try { await createProjectGroup(name); toast.success("已新建课题组"); setNewName(""); await load(); refreshPersonnel(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "新建失败"); }
  };

  const doRenameDept = async (id: number) => {
    const name = deptEditName.trim();
    if (!name) { toast.error("部门名称不能为空"); return; }
    try { await renameDepartment(id, name); toast.success("已改名"); setDeptEditId(null); await load(); refreshPersonnel(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "改名失败"); }
  };

  const doRenameGroup = async (id: number) => {
    const name = groupEditName.trim();
    if (!name) { toast.error("课题组名称不能为空"); return; }
    try { await renameProjectGroup(id, name); toast.success("已改名"); setGroupEditId(null); await load(); refreshPersonnel(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "改名失败"); }
  };

  const doDeleteDept = async (d: DepartmentDict) => {
    if (!window.confirm(`确定删除部门「${d.name}」吗？`)) return;
    try { await deleteDepartment(d.id); toast.success("已删除"); await load(); refreshPersonnel(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "删除失败"); }
  };

  const doDeleteGroup = async (g: ProjectGroupDict) => {
    if (!window.confirm(`确定删除课题组「${g.name}」吗？`)) return;
    try { await deleteProjectGroup(g.id); toast.success("已删除"); await load(); refreshPersonnel(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "删除失败"); }
  };

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
                  <th className="py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.id} className="border-b border-[var(--twin-hairline)]">
                    <td className="py-1.5 text-[var(--twin-body)]">
                      {deptEditId === d.id ? (
                        <input value={deptEditName} onChange={(e) => setDeptEditName(e.target.value)} autoFocus
                          className="w-32 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)]"
                          onKeyDown={(e) => { if (e.key === "Enter") doRenameDept(d.id); if (e.key === "Escape") setDeptEditId(null); }} />
                      ) : d.name}
                    </td>
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
                    <td className="py-1.5">
                      <div className="flex items-center gap-1">
                        {deptEditId === d.id ? (
                          <>
                            <button type="button" className={inkBtn} onClick={() => doRenameDept(d.id)}>保存</button>
                            <button type="button" className={inkBtn} onClick={() => setDeptEditId(null)}>取消</button>
                          </>
                        ) : (
                          <button type="button" className={inkBtn} onClick={() => { setDeptEditId(d.id); setDeptEditName(d.name); }}>改名</button>
                        )}
                        <button type="button" className={`${inkBtn} border-rose-200 text-rose-700 hover:bg-rose-50`} onClick={() => doDeleteDept(d)}>删除</button>
                      </div>
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
                  <th className="py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} className="border-b border-[var(--twin-hairline)]">
                    <td className="py-1.5 text-[var(--twin-body)]">
                      {groupEditId === g.id ? (
                        <input value={groupEditName} onChange={(e) => setGroupEditName(e.target.value)} autoFocus
                          className="w-32 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[11px] text-[var(--twin-ink)]"
                          onKeyDown={(e) => { if (e.key === "Enter") doRenameGroup(g.id); if (e.key === "Escape") setGroupEditId(null); }} />
                      ) : g.name}
                    </td>
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
                    <td className="py-1.5">
                      <div className="flex items-center gap-1">
                        {groupEditId === g.id ? (
                          <>
                            <button type="button" className={inkBtn} onClick={() => doRenameGroup(g.id)}>保存</button>
                            <button type="button" className={inkBtn} onClick={() => setGroupEditId(null)}>取消</button>
                          </>
                        ) : (
                          <button type="button" className={inkBtn} onClick={() => { setGroupEditId(g.id); setGroupEditName(g.name); }}>改名</button>
                        )}
                        <button type="button" className={`${inkBtn} border-rose-200 text-rose-700 hover:bg-rose-50`} onClick={() => doDeleteGroup(g)}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading ? (
            <div className="mt-4 flex items-center gap-2 border-t border-[var(--twin-hairline)] pt-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} autoComplete="off"
                placeholder={tab === "dept" ? "新部门名称" : "新课题组名称"}
                onKeyDown={(e) => { if (e.key === "Enter") { tab === "dept" ? createDept() : createGroup(); } }}
                className="h-7 flex-1 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 text-[11px] text-[var(--twin-ink)]" />
              <AdminButton type="button" tone="primary" size="sm" onClick={tab === "dept" ? createDept : createGroup}>
                + 新建{tab === "dept" ? "部门" : "课题组"}
              </AdminButton>
            </div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}
