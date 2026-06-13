import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";
import { updateProfileDisplayNickname } from "@/api/domains/auth.api";
import {
  usePersonnelList,
  useSystemUsersList,
  useUpdateUserRole,
  useUpdateUserStatus,
  useResetUserPassword,
  useResetUserOpenId,
  useUpdateUserNickname,
  useCreateStaffUser,
  useDeleteSystemUser,
} from "@/api/hooks/usePersonnel";
import type { PersonnelAuthRecord, SystemUserRecord } from "@/api/domains/admin.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { AdminPageShell, AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { Portal } from "@/components/Portal";
import { resetStudentPin } from "@/api/domains/specialChannel.api";

const ROLE_OPTIONS = ["STUDENT", "STAFF", "SENIOR", "ADMIN", "SUPER_ADMIN", "PLATFORM_OWNER"];
const STAFF_CREATE_ROLE_OPTIONS = ["STAFF", "SENIOR", "ADMIN", "SUPER_ADMIN"];
const ROLE_LABEL_MAP: Record<string, string> = {
  STUDENT: "学生",
  STAFF: "普通员工",
  SENIOR: "高级员工",
  ADMIN: "管理员",
  SUPER_ADMIN: "超级管理员",
  PLATFORM_OWNER: "平台所有者",
};
const BUILTIN_SUPER_ADMIN_ID = "SYS_SUPER_ROOT";

export default function AdminPersonnelPage() {
  const role = authStorage.getRole() || "STUDENT";
  const myUserId = authStorage.getUserInfo()?.id ?? authStorage.getUserIdFromToken() ?? "";
  const isSuperAdmin = hasMinRole(role, "SUPER_ADMIN");

  const [keyword, setKeyword] = useState("");
  const [activeTab, setActiveTab] = useState<"personnel" | "system">("personnel");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<Record<string, boolean>>({});
  const [systemNicknameDrafts, setSystemNicknameDrafts] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createNickname, setCreateNickname] = useState("");
  const [createRole, setCreateRole] = useState("STAFF");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailLines, setDetailLines] = useState<{ k: string; v: string }[]>([]);
  const [nickOpen, setNickOpen] = useState(false);
  const [nickRowId, setNickRowId] = useState("");
  const [nickDraft, setNickDraft] = useState("");
  const [aroBindings, setAroBindings] = useState<Record<string, any>>({});

  const {
    data: personnelData,
    isLoading: personnelLoading,
    refetch: refetchPersonnel,
  } = usePersonnelList(page, size, activeTab === "personnel" ? keyword : "");

  const {
    data: systemData,
    isLoading: systemLoading,
    refetch: refetchSystem,
  } = useSystemUsersList(page, size, activeTab === "system" ? keyword : "");

  const personnelRows: PersonnelAuthRecord[] = personnelData?.data ?? [];
  const systemRows: SystemUserRecord[] = systemData?.data ?? [];
  const total = activeTab === "personnel" ? (personnelData?.total ?? 0) : (systemData?.total ?? 0);

  const isLoading = activeTab === "personnel" ? personnelLoading : systemLoading;

  const updateRoleMut = useUpdateUserRole();
  const updateStatusMut = useUpdateUserStatus();
  const resetPasswordMut = useResetUserPassword();
  const resetOpenIdMut = useResetUserOpenId();
  const updateNicknameMut = useUpdateUserNickname();
  const createStaffMut = useCreateStaffUser();
  const deleteSystemUserMut = useDeleteSystemUser();

  useEffect(() => {
    if (activeTab !== "system") return;
    const next: Record<string, string> = {};
    for (const r of systemRows) {
      next[r.id] = r.displayNickname ?? "";
    }
    setSystemNicknameDrafts(next);
  }, [systemRows, activeTab]);

  const refreshAroBindings = () => {
    const token = authStorage.getToken();
    fetch("/api/admin/aro-bindings", { headers: { Authorization: "Bearer " + token } })
      .then((res) => res.json())
      .then((json) => {
        if (json && json.success && Array.isArray(json.data)) {
          const map: Record<string, any> = {};
          for (const b of json.data) {
            if (b.userId) map[b.userId] = b;
          }
          setAroBindings(map);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (isSuperAdmin) {
      refreshAroBindings();
    }
  }, [activeTab, isSuperAdmin]);

  const handleUnbindAro = async (userId: string) => {
    if (!window.confirm("确认解除该用户的 ARO 绑定吗？")) return;
    try {
      const token = authStorage.getToken();
      const res = await fetch(`/api/admin/personnel/${userId}/aro-binding`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
      });
      const json = await res.json();
      if (json && json.success) {
        toast.success("已解除 ARO 绑定");
        refreshAroBindings();
      } else {
        toast.error(json?.message || "解除绑定失败");
      }
    } catch {
      toast.error("解除绑定失败");
    }
  };

  const canEditSystemNicknameRow = (rowId: string) =>
    rowId !== BUILTIN_SUPER_ADMIN_ID && (isSuperAdmin || (myUserId.length > 0 && rowId === myUserId));

  const saveDisplayNickname = async (id: string, raw: string) => {
    const v = raw.trim();
    if (!canEditSystemNicknameRow(id)) return;
    if (isSuperAdmin) {
      updateNicknameMut.mutate({ id, displayNickname: v });
    } else {
      try {
        const data = await updateProfileDisplayNickname(v);
        authStorage.setAuth(data.token, data.role, data.userInfo);
        toast.success("展示昵称已保存");
        setSystemNicknameDrafts((prev) => ({ ...prev, [id]: v }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    }
  };

  const confirmNickDialog = () => {
    if (!nickRowId) return;
    void saveDisplayNickname(nickRowId, nickDraft);
    setNickOpen(false);
    setNickRowId("");
    setNickDraft("");
  };

  const handleRoleChange = (id: string, newRole: string) => {
    updateRoleMut.mutate({ id, role: newRole });
  };

  const onStatusChipClick = (row: { id: string; status?: number }) => {
    if (row.id === BUILTIN_SUPER_ADMIN_ID) return;
    const curOn = row.status !== 0;
    if (curOn) {
      if (!window.confirm("禁用后该账号将无法登录，是否继续？")) return;
      updateStatusMut.mutate({ id: row.id, enabled: false });
    } else {
      if (!window.confirm("是否启用该账号？")) return;
      updateStatusMut.mutate({ id: row.id, enabled: true });
    }
  };

  const togglePasswordVisible = (id: string) => {
    setVisiblePasswordIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderPasswordCell = (row: { id: string; password?: string }) => {
    const isBuiltinSuper = row.id === BUILTIN_SUPER_ADMIN_ID;
    if (isBuiltinSuper) {
      return <span className="text-[var(--twin-mute)]">******（受保护）</span>;
    }
    const visible = Boolean(visiblePasswordIds[row.id]);
    const value = row.password || "-";
    return (
      <div className="inline-flex items-center gap-1 text-[11px]">
        <span className="font-mono text-[var(--twin-body)]">{visible ? value : "******"}</span>
        <button
          type="button"
          className="rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-0.5 text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)]"
          onClick={() => togglePasswordVisible(row.id)}
          title={visible ? "隐藏密码" : "显示密码"}
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  };

  const handleResetPassword = (id: string) => {
    if (!window.confirm("确认重置密码吗？将重置为默认密码。")) return;
    resetPasswordMut.mutate(id);
  };

  const handleResetOpenId = (id: string) => {
    const msg =
      activeTab === "personnel"
        ? "确认重置吗？将清空该学生账号的 openId 绑定。"
        : "确认重置吗？将清空该账号的 openId 绑定。";
    if (!window.confirm(msg)) return;
    resetOpenIdMut.mutate(id);
  };

  const handleResetPin = async (id: string) => {
    if (!window.confirm("确认重置该学生的个人密码（PIN）吗？重置后学生需重新设置。")) return;
    try {
      await resetStudentPin(id);
      toast.success("PIN 已重置");
    } catch (err: any) {
      toast.error(err?.message || "重置 PIN 失败");
    }
  };

  const handleCreateStaff = () => {
    const u = createUsername.trim();
    const p = createPassword;
    if (u.length < 2 || p.length < 6) {
      toast.error("账号至少 2 字符，密码至少 6 位");
      return;
    }
    const nick = createNickname.trim();
    createStaffMut.mutate(
      {
        username: u,
        password: p,
        role: createRole,
        displayNickname: nick.length ? nick : undefined,
      },
      {
        onSuccess: (data) => {
          setCreateOpen(false);
          setCreateUsername("");
          setCreatePassword("");
          setCreateNickname("");
          setCreateRole("STAFF");
        },
      }
    );
  };

  const handleDeleteSystemUser = (row: SystemUserRecord) => {
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
    deleteSystemUserMut.mutate(row.id);
  };

  const totalPages = Math.max(1, Math.ceil(total / size));

  const inkBtn =
    "inline-flex shrink-0 items-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--twin-body)] shadow-sm hover:bg-[var(--twin-canvas-soft)] disabled:cursor-not-allowed disabled:opacity-40";

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
    "h-7 max-w-[9.5rem] rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 text-[11px] text-[var(--twin-body)]";

  const toolBtnBase =
    "inline-flex h-8 shrink-0 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors";
  const toolBtnGhost = `${toolBtnBase} border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]`;
  const toolBtnPrimary = `${toolBtnBase} border-[var(--twin-ink)] bg-[var(--twin-ink)] text-[var(--twin-on-primary)] hover:bg-[var(--twin-body)]`;

  return (
    <AdminPageShell
      title="人员授权"
      description="维护学生与系统员工的登录账号、角色与启用状态；敏感操作需二次确认。"
    >
    <div className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-2 md:p-5">
      <div className="mb-3 flex min-h-9 min-w-0 flex-nowrap items-center gap-2 border-b border-[var(--twin-hairline)] pb-3">
        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--twin-canvas-soft-2)] p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("personnel")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              activeTab === "personnel" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-body)]"
            }`}
          >
            学生
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("system")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              activeTab === "system" ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-sm" : "text-[var(--twin-mute)] hover:text-[var(--twin-body)]"
            }`}
          >
            员工
          </button>
        </div>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="ID / 姓名 / 账号"
          className="min-w-0 flex-1 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2.5 py-1.5 text-xs text-[var(--twin-ink)] placeholder:text-[var(--twin-mute)] focus:border-[var(--twin-hairline-strong)] focus:bg-[var(--twin-canvas)] focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1);
              activeTab === "personnel" ? refetchPersonnel() : refetchSystem();
            }
          }}
        />
        <button
          type="button"
          className={toolBtnPrimary}
          onClick={() => { setPage(1); activeTab === "personnel" ? refetchPersonnel() : refetchSystem(); }}
        >
          查询
        </button>
        <button
          type="button"
          className={toolBtnGhost}
          onClick={() => { activeTab === "personnel" ? refetchPersonnel() : refetchSystem(); }}
        >
          刷新
        </button>
        {activeTab === "system" && isSuperAdmin ? (
          <button type="button" className={toolBtnGhost} onClick={() => setCreateOpen(true)}>
            新建
          </button>
        ) : null}
      </div>

      {createOpen && activeTab === "system" ? <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-md rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-5 shadow-twin-level-4">
            <h3 className="mb-3 text-base font-semibold text-[var(--twin-ink)]">新建员工账号</h3>
            <p className="mb-3 text-xs text-[var(--twin-mute)]">登录密码由你设置；新建账号首次登录需改密。不可创建平台所有者。</p>
            <div className="space-y-2 text-sm">
              <label className="block">
                <span className="text-[var(--twin-body)]">登录名</span>
                <input
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  className="mt-1 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-[var(--twin-body)]">密码</span>
                <input
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="mt-1 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
                  autoComplete="new-password"
                />
              </label>
              <label className="block">
                <span className="text-[var(--twin-body)]">展示昵称（可选）</span>
                <input
                  value={createNickname}
                  onChange={(e) => setCreateNickname(e.target.value)}
                  maxLength={32}
                  className="mt-1 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
                />
              </label>
              <label className="block">
                <span className="text-[var(--twin-body)]">角色</span>
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                  className="mt-1 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
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
                className="rounded-lg border border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--twin-body)]"
                onClick={() => setCreateOpen(false)}
                disabled={createStaffMut.isPending}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                onClick={() => handleCreateStaff()}
                disabled={createStaffMut.isPending}
              >
                {createStaffMut.isPending ? "提交中…" : "创建"}
              </button>
            </div>
          </div>
        </div></Portal> : null}

      <AdminDataTableWrap scrollable>
        <table className="min-w-full text-xs">
          <thead className="bg-[var(--twin-canvas-soft)] text-[11px] text-[var(--twin-body)]">
            <tr>
              <th className="px-2 py-2 text-left font-medium">ID</th>
              <th className="px-2 py-2 text-left font-medium">
                {activeTab === "personnel" ? "姓名与操作" : "账号与操作"}
              </th>
              {activeTab === "system" ? (
                <th className="px-2 py-2 text-left font-medium">展示昵称</th>
              ) : null}
              {activeTab === "personnel" && isSuperAdmin ? (
                <th className="px-2 py-2 text-left font-medium">已绑定账号</th>
              ) : null}
              {activeTab === "system" && isSuperAdmin ? (
                <th className="px-2 py-2 text-left font-medium">ARO绑定</th>
              ) : null}
              <th className="px-2 py-2 text-left font-medium">角色</th>
              <th className="px-2 py-2 text-left font-medium">密码</th>
              {isSuperAdmin ? (
                <th className="px-2 py-2 text-left font-medium">个人密码</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-2 py-4 text-center text-[var(--twin-mute)]" colSpan={activeTab === "personnel" ? (isSuperAdmin ? 5 : 4) : activeTab === "system" && isSuperAdmin ? 6 : 5}>
                  加载中…
                </td>
              </tr>
            ) : activeTab === "personnel" ? (
              personnelRows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--twin-hairline)]">
                  <td className="max-w-[8rem] truncate px-2 py-1.5 font-mono text-[11px] text-[var(--twin-body)]">{row.id}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex min-w-0 max-w-[28rem] flex-nowrap items-center gap-1">
                      <span className="min-w-0 shrink truncate font-medium text-[var(--twin-ink)]">
                        {row.name || row.username || "-"}
                      </span>
                      {row.id === BUILTIN_SUPER_ADMIN_ID ? (
                        <span className="shrink-0 rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-0.5 text-[11px] text-[var(--twin-mute)]">
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
                            onClick={() => handleResetOpenId(row.id)}
                          >
                            重置绑定
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  {isSuperAdmin ? (
                    <td className="px-2 py-1.5 align-middle">
                      {row.username ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                          {row.username}
                          <span className="text-emerald-500">({ROLE_LABEL_MAP[row.role || "STUDENT"]})</span>
                        </span>
                      ) : (
                        <span className="text-[var(--twin-mute)]">-</span>
                      )}
                    </td>
                  ) : null}
                  <td className="px-2 py-1.5 align-middle">
                    <select
                      disabled={row.id === BUILTIN_SUPER_ADMIN_ID}
                      value={row.role || "STUDENT"}
                      onChange={(e) => handleRoleChange(row.id, e.target.value)}
                      className={`${selectRoleCls} disabled:cursor-not-allowed disabled:bg-[var(--twin-canvas-soft)] disabled:text-[var(--twin-mute)]`}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL_MAP[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 align-middle">{renderPasswordCell(row)}</td>
                  {/*
                    个人密码（PIN）列 — 仅 SUPER_ADMIN 可见
                    注意：人员表（学生分区）列出的是 aro_personnel 中的人员，
                    不论其 sys_user.role 是否为 STUDENT。
                    只要在人员库中即为"学生视角账号"，均可设置/使用个人密码。
                    personalPin !== undefined 表示该人员来自 aro_personnel（有 PIN 字段）；
                    undefined 表示来自系统用户表（无 PIN 概念）。
                  */}
                  {isSuperAdmin ? (
                    <td className="px-2 py-1.5 align-middle">
                      {row.personalPin !== undefined ? (
                        <div className="flex items-center gap-1">
                          <span className={`text-[11px] ${row.personalPin ? "text-emerald-600" : "text-[var(--twin-mute)]"}`}>
                            {row.personalPin ? "已设置" : "未设置"}
                          </span>
                          {row.personalPin ? (
                            <button type="button"
                              className="text-[10px] text-red-500 hover:underline"
                              onClick={() => handleResetPin(row.id)}>
                              清空
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-[var(--twin-mute)] text-[11px]">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              systemRows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--twin-hairline)]">
                  <td className="max-w-[8rem] truncate px-2 py-1.5 font-mono text-[11px] text-[var(--twin-body)]">{row.id}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex min-w-0 max-w-[28rem] flex-nowrap items-center gap-1">
                      <span className="min-w-0 shrink truncate font-medium text-[var(--twin-ink)]">
                        {row.username || "-"}
                      </span>
                      {row.id === BUILTIN_SUPER_ADMIN_ID ? (
                        <span className="shrink-0 rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-0.5 text-[11px] text-[var(--twin-mute)]">
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
                            onClick={() => handleResetPassword(row.id)}
                          >
                            改密
                          </button>
                          <button type="button" className={inkBtn} onClick={() => handleResetOpenId(row.id)}>
                            重置绑定
                          </button>
                          {isSuperAdmin && (row.role === "STUDENT" || String(row.role).includes("STUDENT")) ? (
                            <button
                              type="button"
                              className={`${inkBtn} border-amber-200 text-amber-700 hover:bg-amber-50`}
                              onClick={() => handleResetPin(row.id)}
                            >
                              重置PIN
                            </button>
                          ) : null}
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
                            onClick={() => handleDeleteSystemUser(row)}
                          >
                            删除
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    {row.id === BUILTIN_SUPER_ADMIN_ID ? (
                      <span className="text-[var(--twin-mute)]">—</span>
                    ) : (
                      <button
                        type="button"
                        disabled={!canEditSystemNicknameRow(row.id)}
                        className="max-w-[10rem] truncate text-left text-[11px] font-medium text-[var(--twin-link)] underline decoration-[var(--twin-link)]/30 underline-offset-2 hover:text-[var(--twin-link-deep)] disabled:cursor-not-allowed disabled:text-[var(--twin-mute)] disabled:no-underline"
                        onClick={() => openNickDialog(row)}
                      >
                        {(systemNicknameDrafts[row.id] ?? row.displayNickname ?? "").trim() || "点击设置昵称"}
                      </button>
                    )}
                  </td>
                  {isSuperAdmin ? (
                    <td className="px-2 py-1.5 align-middle">
                      {(() => {
                        const b = aroBindings[row.id];
                        if (!b) return <span className="text-[var(--twin-mute)]">-</span>;
                        return (
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-[var(--twin-body)]">
                              {b.name || b.aroUserId} ({b.aroUserId})
                            </span>
                            <button
                              type="button"
                              className={`${inkBtn} border-rose-200 text-rose-700 hover:bg-rose-50`}
                              onClick={() => handleUnbindAro(row.id)}
                            >
                              解绑
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                  ) : null}
                  <td className="px-2 py-1.5 align-middle">
                    <select
                      disabled={row.id === BUILTIN_SUPER_ADMIN_ID}
                      value={row.role || "STAFF"}
                      onChange={(e) => handleRoleChange(row.id, e.target.value)}
                      className={`${selectRoleCls} disabled:cursor-not-allowed disabled:bg-[var(--twin-canvas-soft)] disabled:text-[var(--twin-mute)]`}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL_MAP[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 align-middle">{renderPasswordCell(row)}</td>
                  {isSuperAdmin ? (
                    <td className="px-2 py-1.5 align-middle text-[var(--twin-mute)] text-[11px]">—</td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </AdminDataTableWrap>

      {detailOpen ? <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-4">
            <div className="border-b border-[var(--twin-hairline)] px-4 py-3 text-sm font-semibold text-[var(--twin-ink)]">{detailTitle}</div>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4 text-xs">
              {detailLines.map((line) => (
                <div key={line.k}>
                  <div className="text-[11px] text-[var(--twin-mute)]">{line.k}</div>
                  <div className="mt-0.5 break-all text-[var(--twin-ink)]">{line.v}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-[var(--twin-hairline)] px-4 py-2">
              <button
                type="button"
                className="rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                onClick={() => setDetailOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div></Portal> : null}

      {nickOpen ? <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-sm rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-4">
            <div className="text-sm font-semibold text-[var(--twin-ink)]">修改展示昵称</div>
            <input
              value={nickDraft}
              onChange={(e) => setNickDraft(e.target.value)}
              maxLength={32}
              className="mt-3 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
              placeholder="最多 32 字"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
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
                onClick={() => confirmNickDialog()}
              >
                确认
              </button>
            </div>
          </div>
        </div></Portal> : null}

      <div className="mt-3 flex items-center justify-between text-sm text-[var(--twin-body)]">
        <div>共 {total} 条</div>
        <div className="flex items-center gap-2">
          <select
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
          >
            {[10, 20, 30, 50].map((s) => (
              <option key={s} value={s}>{s}/页</option>
            ))}
          </select>
          <button
            className="rounded border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span>{page} / {totalPages}</span>
          <button
            className="rounded border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-50"
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
