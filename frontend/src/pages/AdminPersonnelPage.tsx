import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";
import { updateProfileDisplayNickname } from "@/api/domains/auth.api";
import {
  createSystemStaffUser,
  deleteSystemUser,
  fetchAdminPersonnel,
  fetchSystemOnlyUsers,
  resetUserOpenId,
  resetUserPassword,
  updateUserRole,
  updateUserStatus,
  updateUserDisplayNickname,
  type PersonnelAuthRecord,
  type SystemUserRecord,
} from "@/api/domains/admin.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { AdminPageShell, AdminDataTableWrap } from "@/components/admin/AdminPageShell";

const ROLE_OPTIONS = ["STUDENT", "STAFF", "SENIOR", "ADMIN", "SUPER_ADMIN", "PLATFORM_OWNER"];
/** 新建员工账号可选角色（不可选学生 / 平台所有者） */
const STAFF_CREATE_ROLE_OPTIONS = ["STAFF", "SENIOR", "ADMIN", "SUPER_ADMIN"];
const ROLE_LABEL_MAP: Record<string, string> = {
  STUDENT: "学生",
  STAFF: "普通员工",
  SENIOR: "高级员工",
  ADMIN: "管理员",
  SUPER_ADMIN: "超级管理员",
  PLATFORM_OWNER: "平台所有者",
};
/** 内置根账号，角色固定为 PLATFORM_OWNER */
const BUILTIN_SUPER_ADMIN_ID = "SYS_SUPER_ROOT";

export default function AdminPersonnelPage() {
  const role = authStorage.getRole() || "STUDENT";
  const myUserId = authStorage.getUserInfo()?.id ?? authStorage.getUserIdFromToken() ?? "";
  const isSuperAdmin = hasMinRole(role, "SUPER_ADMIN");

  const [keyword, setKeyword] = useState("");
  const [activeTab, setActiveTab] = useState<"personnel" | "system">("personnel");
  const [personnelRows, setPersonnelRows] = useState<PersonnelAuthRecord[]>([]);
  const [systemRows, setSystemRows] = useState<SystemUserRecord[]>([]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<Record<string, boolean>>({});
  const [systemNicknameDrafts, setSystemNicknameDrafts] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createNickname, setCreateNickname] = useState("");
  const [createRole, setCreateRole] = useState("STAFF");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailLines, setDetailLines] = useState<{ k: string; v: string }[]>([]);
  const [nickOpen, setNickOpen] = useState(false);
  const [nickRowId, setNickRowId] = useState("");
  const [nickDraft, setNickDraft] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "personnel") {
        const res = await fetchAdminPersonnel(page, size, keyword);
        setPersonnelRows(res.data);
        setTotal(res.total);
      } else {
        const res = await fetchSystemOnlyUsers(page, size, keyword);
        setSystemRows(res.data);
        setTotal(res.total);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page, size]);

  useEffect(() => {
    if (activeTab !== "system") return;
    const next: Record<string, string> = {};
    for (const r of systemRows) {
      next[r.id] = r.displayNickname ?? "";
    }
    setSystemNicknameDrafts(next);
  }, [systemRows, activeTab]);

  const canEditSystemNicknameRow = (rowId: string) =>
    rowId !== BUILTIN_SUPER_ADMIN_ID && (isSuperAdmin || (myUserId.length > 0 && rowId === myUserId));

  const saveDisplayNickname = async (id: string, raw: string) => {
    const v = raw.trim();
    if (!canEditSystemNicknameRow(id)) return;
    try {
      if (isSuperAdmin) {
        await updateUserDisplayNickname(id, v);
      } else {
        const data = await updateProfileDisplayNickname(v);
        authStorage.setAuth(data.token, data.role, data.userInfo);
      }
      toast.success("展示昵称已保存");
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      setSystemNicknameDrafts((prev) => ({ ...prev, [id]: v }));
      setSystemRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, displayNickname: v } : row))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const confirmNickDialog = async () => {
    if (!nickRowId) return;
    await saveDisplayNickname(nickRowId, nickDraft);
    setNickOpen(false);
    setNickRowId("");
    setNickDraft("");
  };

  const handleRoleChange = async (id: string, role: string) => {
    try {
      await updateUserRole(id, role);
      toast.success("角色更新成功");
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      setPersonnelRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, role } : row))
      );
      setSystemRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, role } : row))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    }
  };

  const applyStatusChange = async (id: string, enabled: boolean) => {
    try {
      await updateUserStatus(id, enabled);
      toast.success(enabled ? "账号已启用" : "账号已禁用");
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      const nextStatus = enabled ? 1 : 0;
      setPersonnelRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, status: nextStatus } : row))
      );
      setSystemRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, status: nextStatus } : row))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    }
  };

  const onStatusChipClick = (row: { id: string; status?: number }) => {
    if (row.id === BUILTIN_SUPER_ADMIN_ID) return;
    const curOn = row.status !== 0;
    if (curOn) {
      if (!window.confirm("禁用后该账号将无法登录，是否继续？")) return;
      void applyStatusChange(row.id, false);
    } else {
      if (!window.confirm("是否启用该账号？")) return;
      void applyStatusChange(row.id, true);
    }
  };

  const togglePasswordVisible = (id: string) => {
    setVisiblePasswordIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderPasswordCell = (row: { id: string; password?: string }) => {
    const isBuiltinSuper = row.id === BUILTIN_SUPER_ADMIN_ID;
    if (isBuiltinSuper) {
      return <span className="text-slate-400">******（受保护）</span>;
    }
    const visible = Boolean(visiblePasswordIds[row.id]);
    const value = row.password || "-";
    return (
      <div className="inline-flex items-center gap-1 text-[11px]">
        <span className="font-mono text-slate-700">{visible ? value : "******"}</span>
        <button
          type="button"
          className="rounded border border-slate-200 bg-white p-0.5 text-slate-500 hover:bg-slate-50"
          onClick={() => togglePasswordVisible(row.id)}
          title={visible ? "隐藏密码" : "显示密码"}
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  };

  const handleResetPassword = async (id: string) => {
    if (!window.confirm("确认重置密码吗？将重置为默认密码。")) return;
    try {
      const data = await resetUserPassword(id);
      toast.success(`密码已重置，默认密码：${data.defaultPassword}，请让用户到个人中心完成改密`);
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      setSystemRows((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, password: data.defaultPassword } : row
        )
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置失败");
    }
  };

  const handleResetOpenId = async (id: string) => {
    const msg =
      activeTab === "personnel"
        ? "确认重置吗？将清空该学生账号的 openId 绑定。"
        : "确认重置吗？将清空该账号的 openId 绑定。";
    if (!window.confirm(msg)) return;
    try {
      await resetUserOpenId(id);
      toast.success("openId 绑定已重置");
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      setPersonnelRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, openId: undefined } : row))
      );
      setSystemRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, openId: undefined } : row))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置失败");
    }
  };

  const handleCreateStaff = async () => {
    const u = createUsername.trim();
    const p = createPassword;
    if (u.length < 2 || p.length < 6) {
      toast.error("账号至少 2 字符，密码至少 6 位");
      return;
    }
    setCreateSubmitting(true);
    try {
      const nick = createNickname.trim();
      const data = await createSystemStaffUser({
        username: u,
        password: p,
        role: createRole,
        displayNickname: nick.length ? nick : undefined,
      });
      toast.success("员工账号已创建");
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      const row: SystemUserRecord = {
        id: data.id,
        username: data.username,
        displayNickname: data.displayNickname,
        role: data.role,
        status: 1,
        password: "******",
      };
      setSystemRows((prev) => [row, ...prev]);
      setTotal((t) => t + 1);
      setSystemNicknameDrafts((prev) => ({ ...prev, [data.id]: data.displayNickname ?? "" }));
      setCreateOpen(false);
      setCreateUsername("");
      setCreatePassword("");
      setCreateNickname("");
      setCreateRole("STAFF");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleDeleteSystemUser = async (row: SystemUserRecord) => {
    if (row.id === BUILTIN_SUPER_ADMIN_ID) return;
    const login = (row.username || "").trim();
    if (!login) {
      toast.error("该账号无登录名，无法二次确认删除");
      return;
    }
    const name = row.username || row.id;
    if (!window.confirm(`确定永久删除员工账号「${name}」吗？此操作不可恢复。`)) return;
    if (!window.confirm("请再次确认：删除后无法恢复，是否继续？")) return;
    const typed = window.prompt(`最后一步：请输入登录名「${login}」以确认删除`);
    if (typed !== login) {
      toast.error(typed == null || typed === "" ? "已取消删除" : "登录名不一致，已取消");
      return;
    }
    try {
      await deleteSystemUser(row.id);
      toast.success("已删除");
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      setSystemRows((prev) => prev.filter((r) => r.id !== row.id));
      setSystemNicknameDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setTotal((t) => Math.max(0, t - 1));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / size));

  const inkBtn =
    "inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  const openPersonnelDetail = (row: PersonnelAuthRecord) => {
    setDetailTitle(row.name || row.username || row.id || "详情");
    setDetailLines([
      { k: "用户 ID", v: row.id || "—" },
      { k: "姓名", v: row.name || "—" },
      { k: "登录账号", v: row.username || "—" },
      { k: "工号", v: row.jobNumber || "—" },
      { k: "部门", v: row.departmentName || "—" },
      { k: "项目组", v: row.projectGroupName || "—" },
      { k: "角色", v: ROLE_LABEL_MAP[row.role || "STUDENT"] || row.role || "—" },
      { k: "状态", v: row.status === 0 ? "禁用" : "启用" },
      {
        k: "密码",
        v:
          row.id === BUILTIN_SUPER_ADMIN_ID
            ? "******（受保护）"
            : row.password != null
              ? String(row.password)
              : "—",
      },
    ]);
    setDetailOpen(true);
  };

  const openSystemDetail = (row: SystemUserRecord) => {
    setDetailTitle(row.username || row.id || "详情");
    setDetailLines([
      { k: "用户 ID", v: row.id || "—" },
      { k: "登录账号", v: row.username || "—" },
      { k: "展示昵称", v: row.displayNickname ?? "—" },
      { k: "创建时间", v: row.createTime ? String(row.createTime) : "—" },
      { k: "角色", v: ROLE_LABEL_MAP[row.role || "STAFF"] || row.role || "—" },
      { k: "状态", v: row.status === 0 ? "禁用" : "启用" },
      {
        k: "密码",
        v:
          row.id === BUILTIN_SUPER_ADMIN_ID
            ? "******（受保护）"
            : row.password != null
              ? String(row.password)
              : "—",
      },
    ]);
    setDetailOpen(true);
  };

  const openNickDialog = (row: SystemUserRecord) => {
    if (!canEditSystemNicknameRow(row.id)) return;
    setNickRowId(row.id);
    setNickDraft(systemNicknameDrafts[row.id] ?? row.displayNickname ?? "");
    setNickOpen(true);
  };

  const selectRoleCls =
    "h-7 max-w-[9.5rem] rounded-md border border-slate-200 bg-white px-1.5 text-[11px] text-slate-700";

  const toolBtnBase =
    "inline-flex h-8 shrink-0 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors";
  const toolBtnGhost = `${toolBtnBase} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
  const toolBtnPrimary = `${toolBtnBase} border-slate-900 bg-slate-900 text-white hover:bg-slate-800`;

  return (
    <AdminPageShell
      title="人员授权"
      description="维护学生与系统员工的登录账号、角色与启用状态；敏感操作需二次确认。保存成功后仅合并当前行数据，禁止整表重新加载（post-save-no-full-refresh.mdc）。"
    >
    <div className="rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-sm ring-1 ring-black/[0.02] md:p-5">
      <div className="mb-3 flex min-h-9 min-w-0 flex-nowrap items-center gap-2 border-b border-neutral-100 pb-3">
        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-neutral-100 p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("personnel")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              activeTab === "personnel" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            学生
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("system")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              activeTab === "system" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            员工
          </button>
        </div>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="ID / 姓名 / 账号"
          className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") void loadData();
          }}
        />
        <button type="button" className={toolBtnPrimary} onClick={() => void loadData()}>
          查询
        </button>
        <button type="button" className={toolBtnGhost} onClick={() => void loadData()}>
          刷新
        </button>
        {activeTab === "system" && isSuperAdmin ? (
          <button type="button" className={toolBtnGhost} onClick={() => setCreateOpen(true)}>
            新建
          </button>
        ) : null}
      </div>

      {createOpen && activeTab === "system" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-base font-semibold text-slate-900">新建员工账号</h3>
            <p className="mb-3 text-xs text-slate-500">登录密码由你设置；新建账号首次登录需改密。不可创建平台所有者。</p>
            <div className="space-y-2 text-sm">
              <label className="block">
                <span className="text-slate-600">登录名</span>
                <input
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-slate-600">密码</span>
                <input
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  autoComplete="new-password"
                />
              </label>
              <label className="block">
                <span className="text-slate-600">展示昵称（可选）</span>
                <input
                  value={createNickname}
                  onChange={(e) => setCreateNickname(e.target.value)}
                  maxLength={32}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-slate-600">角色</span>
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {STAFF_CREATE_ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL_MAP[r]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onClick={() => setCreateOpen(false)}
                disabled={createSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                onClick={() => void handleCreateStaff()}
                disabled={createSubmitting}
              >
                {createSubmitting ? "提交中…" : "创建"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminDataTableWrap scrollable>
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-[11px] text-slate-600">
            <tr>
              <th className="px-2 py-2 text-left font-medium">ID</th>
              <th className="px-2 py-2 text-left font-medium">
                {activeTab === "personnel" ? "姓名与操作" : "账号与操作"}
              </th>
              {activeTab === "system" ? (
                <th className="px-2 py-2 text-left font-medium">展示昵称</th>
              ) : null}
              <th className="px-2 py-2 text-left font-medium">角色</th>
              <th className="px-2 py-2 text-left font-medium">密码</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-2 py-4 text-center text-slate-500" colSpan={activeTab === "personnel" ? 4 : 5}>
                  加载中…
                </td>
              </tr>
            ) : activeTab === "personnel" ? (
              personnelRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="max-w-[8rem] truncate px-2 py-1.5 font-mono text-[11px] text-slate-600">{row.id}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex min-w-0 max-w-[28rem] flex-nowrap items-center gap-1">
                      <span className="min-w-0 shrink truncate font-medium text-slate-800">
                        {row.name || row.username || "-"}
                      </span>
                      {row.id === BUILTIN_SUPER_ADMIN_ID ? (
                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                          受保护
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              row.status === 0
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-800"
                            }`}
                            onClick={() => onStatusChipClick(row)}
                          >
                            {row.status === 0 ? "已禁用" : "启用中"}
                          </button>
                          <button type="button" className={inkBtn} onClick={() => openPersonnelDetail(row)}>
                            详情
                          </button>
                          <button
                            type="button"
                            className={inkBtn}
                            onClick={() => void handleResetOpenId(row.id)}
                          >
                            重置绑定
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <select
                      disabled={row.id === BUILTIN_SUPER_ADMIN_ID}
                      value={row.role || "STUDENT"}
                      onChange={(e) => handleRoleChange(row.id, e.target.value)}
                      className={`${selectRoleCls} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL_MAP[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 align-middle">{renderPasswordCell(row)}</td>
                </tr>
              ))
            ) : (
              systemRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="max-w-[8rem] truncate px-2 py-1.5 font-mono text-[11px] text-slate-600">{row.id}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex min-w-0 max-w-[28rem] flex-nowrap items-center gap-1">
                      <span className="min-w-0 shrink truncate font-medium text-slate-800">
                        {row.username || "-"}
                      </span>
                      {row.id === BUILTIN_SUPER_ADMIN_ID ? (
                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                          受保护
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              row.status === 0
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-800"
                            }`}
                            onClick={() => onStatusChipClick(row)}
                          >
                            {row.status === 0 ? "已禁用" : "启用中"}
                          </button>
                          <button type="button" className={inkBtn} onClick={() => openSystemDetail(row)}>
                            详情
                          </button>
                          <button
                            type="button"
                            disabled={row.id === BUILTIN_SUPER_ADMIN_ID}
                            className={inkBtn}
                            onClick={() => void handleResetPassword(row.id)}
                          >
                            改密
                          </button>
                          <button type="button" className={inkBtn} onClick={() => void handleResetOpenId(row.id)}>
                            重置绑定
                          </button>
                          <button
                            type="button"
                            disabled={
                              row.id === BUILTIN_SUPER_ADMIN_ID ||
                              row.id === myUserId ||
                              !(row.username && String(row.username).trim())
                            }
                            title={
                              row.id === myUserId
                                ? "不可删除当前登录账号"
                                : !(row.username && String(row.username).trim())
                                  ? "无登录名不可删除"
                                  : undefined
                            }
                            className={`${inkBtn} border-rose-200 text-rose-700 hover:bg-rose-50`}
                            onClick={() => void handleDeleteSystemUser(row)}
                          >
                            删除
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    {row.id === BUILTIN_SUPER_ADMIN_ID ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <button
                        type="button"
                        disabled={!canEditSystemNicknameRow(row.id)}
                        className="max-w-[10rem] truncate text-left text-[11px] font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                        onClick={() => openNickDialog(row)}
                      >
                        {(systemNicknameDrafts[row.id] ?? row.displayNickname ?? "").trim() || "点击设置昵称"}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <select
                      disabled={row.id === BUILTIN_SUPER_ADMIN_ID}
                      value={row.role || "STAFF"}
                      onChange={(e) => handleRoleChange(row.id, e.target.value)}
                      className={`${selectRoleCls} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL_MAP[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 align-middle">{renderPasswordCell(row)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </AdminDataTableWrap>

      {detailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">{detailTitle}</div>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4 text-xs">
              {detailLines.map((line) => (
                <div key={line.k}>
                  <div className="text-[11px] text-slate-500">{line.k}</div>
                  <div className="mt-0.5 break-all text-slate-800">{line.v}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-slate-100 px-4 py-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => setDetailOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {nickOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="text-sm font-semibold text-slate-900">修改展示昵称</div>
            <input
              value={nickDraft}
              onChange={(e) => setNickDraft(e.target.value)}
              maxLength={32}
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="最多 32 字"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setNickOpen(false);
                  setNickRowId("");
                  setNickDraft("");
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700"
                onClick={() => void confirmNickDialog()}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <div>共 {total} 条</div>
        <div className="flex items-center gap-2">
          <select
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded border border-slate-300 px-2 py-1"
          >
            {[10, 20, 30, 50].map((s) => (
              <option key={s} value={s}>{s}/页</option>
            ))}
          </select>
          <button
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span>{page} / {totalPages}</span>
          <button
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
    </AdminPageShell>
  );
}
