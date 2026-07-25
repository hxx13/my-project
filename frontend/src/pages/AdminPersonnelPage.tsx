import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
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
  useResetPersonnelAccount,
  useResetPersonnelPassword,
} from "@/api/hooks/usePersonnel";
import type { PersonnelAuthRecord, SystemUserRecord } from "@/api/domains/admin.api";
import { viewUserPassword } from "@/api/domains/admin.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole, hasMobileHtml5Privilege, MOBILE_HTML5_PRIVILEGE_MIN_ROLE } from "@/features/auth/roleAccess";
import { AdminPageShell, AdminFormCard } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { Portal } from "@/components/Portal";
import { resetStudentPin } from "@/api/domains/specialChannel.api";
import { PersonnelMobileTokenCell } from "@/components/admin/PersonnelMobileTokenCell";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";

const ROLE_OPTIONS = ["MEMBER", "STAFF", "SENIOR", "ADMIN", "SUPER_ADMIN", "PLATFORM_OWNER"];
const STAFF_CREATE_ROLE_OPTIONS = ["STAFF", "SENIOR", "ADMIN", "SUPER_ADMIN"];
const ROLE_LABEL_MAP: Record<string, string> = {
  MEMBER: "学生",
  STAFF: "普通员工",
  SENIOR: "高级员工",
  ADMIN: "管理员",
  SUPER_ADMIN: "超级管理员",
  PLATFORM_OWNER: "平台所有者",
};
const BUILTIN_SUPER_ADMIN_ID = "SYS_SUPER_ROOT";

export default function AdminPersonnelPage() {
  const role = authStorage.getRole() || "MEMBER";
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
  const [passwordPlainCache, setPasswordPlainCache] = useState<Record<string, string | null>>({});
  const [passwordLoading, setPasswordLoading] = useState<Record<string, boolean>>({});
  const [resetAccountOpen, setResetAccountOpen] = useState<string | null>(null);
  const [resetAccountDraft, setResetAccountDraft] = useState("");
  const [emailEditOpen, setEmailEditOpen] = useState<string | null>(null);
  const [emailEditDraft, setEmailEditDraft] = useState("");
  const [emailEditSaving, setEmailEditSaving] = useState(false);

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
  const resetPersonnelAccountMut = useResetPersonnelAccount();
  const resetPersonnelPasswordMut = useResetPersonnelPassword();

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

  const togglePasswordVisible = async (id: string) => {
    if (visiblePasswordIds[id]) {
      setVisiblePasswordIds((prev) => ({ ...prev, [id]: false }));
      return;
    }
    if (passwordPlainCache[id] !== undefined) {
      setVisiblePasswordIds((prev) => ({ ...prev, [id]: true }));
      return;
    }
    setPasswordLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const result = await viewUserPassword(id);
      const plaintext = result.password ?? null;
      setPasswordPlainCache((prev) => ({ ...prev, [id]: plaintext }));
      setVisiblePasswordIds((prev) => ({ ...prev, [id]: true }));
      if (plaintext === null) {
        toast(result.message || "该密码暂不可查看，请先重置密码", { icon: "ℹ️" });
      }
    } catch (err: any) {
      toast.error(err?.message || "获取密码失败");
    } finally {
      setPasswordLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const renderPasswordCell = (row: { id: string; password?: string }) => {
    const isBuiltinSuper = row.id === BUILTIN_SUPER_ADMIN_ID;
    if (isBuiltinSuper) {
      return <span className="text-[var(--twin-mute)]">******（受保护）</span>;
    }
    const visible = Boolean(visiblePasswordIds[row.id]);
    const loading = Boolean(passwordLoading[row.id]);
    const plaintext = passwordPlainCache[row.id];
    let displayValue = "******";
    if (visible) {
      if (loading) {
        displayValue = "加载中…";
      } else if (plaintext !== undefined) {
        displayValue = plaintext ?? "（暂不可查看）";
      } else {
        displayValue = "******";
      }
    }
    return (
      <div className="inline-flex items-center gap-1 text-[11px]">
        <span className={`font-mono text-[var(--twin-body)] ${!visible ? "" : "select-all"}`}>{displayValue}</span>
        <button
          type="button"
          disabled={loading}
          className="rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-0.5 text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] disabled:opacity-50"
          onClick={() => togglePasswordVisible(row.id)}
          title={visible ? "隐藏密码" : "查看密码"}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
           visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
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

  const handleResetPin = async (personnelUserId: string, displayName?: string) => {
    const uid = personnelUserId.trim();
    if (!uid) return;
    const label = displayName?.trim() ? `${displayName.trim()}（${uid}）` : uid;
    if (!window.confirm(`确认重置人员库学号 ${label} 的扫码个人密码（PIN）吗？\n\nPIN 按人员库学号存储，与系统登录账号（USR_*）无关。重置后该人员需重新设置 PIN。`)) return;
    try {
      await resetStudentPin(uid);
      toast.success(`已重置 ${label} 的 PIN`);
      if (activeTab === "personnel") {
        void refetchPersonnel();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "重置 PIN 失败");
    }
  };

  const jumpToPersonnelPinReset = (personnelUserId: string, name?: string) => {
    const uid = personnelUserId.trim();
    if (!uid) return;
    setActiveTab("personnel");
    setPage(1);
    setKeyword(uid);
    toast(`已在人员库 Tab 筛选学号 ${name?.trim() ? `${name.trim()} · ${uid}` : uid}，请在 PIN 列操作`, { icon: "ℹ️" });
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

  const location = useLocation();
  const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);

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
      { k: "角色", v: ROLE_LABEL_MAP[row.role || "MEMBER"] || row.role || "—" },
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
    <AdminPageShell>
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">

        {/* ═══ 第一层：操作+筛选卡片（shrink-0，始终可见） ═══ */}
        <AdminFormCard className="shrink-0 mb-3">

          {/* 第一行：入口名称（左） + 操作按钮（右），下方有分隔线 */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
            <h2 className="text-base font-bold text-[var(--app-color-text-primary)] shrink-0">{pageLabel}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {activeTab === "system" && isSuperAdmin ? (
                <AdminButton type="button" tone="primary" size="sm" onClick={() => setCreateOpen(true)}>
                  新建
                </AdminButton>
              ) : null}
              <AdminButton type="button" tone="secondary" size="sm" onClick={() => { activeTab === "personnel" ? refetchPersonnel() : refetchSystem(); }}>
                刷新
              </AdminButton>
            </div>
          </div>

          {/* 第二行：表格筛选控件 */}
          <div className="flex flex-wrap items-end gap-3">
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
              className="min-w-0 flex-1 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-1.5 text-xs text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  activeTab === "personnel" ? refetchPersonnel() : refetchSystem();
                }
              }}
            />
            <AdminButton type="button" tone="primary" size="sm" onClick={() => { setPage(1); activeTab === "personnel" ? refetchPersonnel() : refetchSystem(); }}>
              查询
            </AdminButton>
          </div>
        </AdminFormCard>

        {/* ═══ 第二层：表格 + 翻页（flex-1，填满剩余空间） ═══ */}
        <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">

          {/* 表格滚动区 */}
          <div className="flex-1 min-h-0 overflow-auto">
            {isLoading ? (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">加载中…</div>
            ) : (
              <div>
        <table className="w-full min-w-max text-left text-xs whitespace-nowrap border-collapse">
          <thead className="border-b-2 border-[var(--app-color-border-strong)]">
            <tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
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
              {activeTab === "personnel" ? (
                <th className="px-2 py-2 text-center font-medium w-[72px]">手机直达</th>
              ) : null}
              {activeTab === "personnel" ? (
                <th className="px-2 py-2 text-left font-medium">邮箱</th>
              ) : null}
              {activeTab === "personnel" ? (
                <th className="px-2 py-2 text-left font-medium">微信通知</th>
              ) : null}
              <th className="px-2 py-2 text-left font-medium">
                <span className="block">角色</span>
                {activeTab === "personnel" ? (
                  <span className="block text-[10px] font-normal text-[var(--twin-mute)] leading-tight mt-0.5">
                    {ROLE_LABEL_MAP[MOBILE_HTML5_PRIVILEGE_MIN_ROLE]}及以上：笼架详情免课题组过滤
                  </span>
                ) : null}
              </th>
              <th className="px-2 py-2 text-left font-medium">密码</th>
              {isSuperAdmin ? (
                <th className="px-2 py-2 text-left font-medium">个人密码</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-2 py-4 text-center text-[var(--twin-mute)]" colSpan={activeTab === "personnel" ? (isSuperAdmin ? 8 : 7) : activeTab === "system" && isSuperAdmin ? 6 : 5}>
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
                          <button
                            type="button"
                            className={inkBtn}
                            onClick={() => {
                              setResetAccountOpen(row.id);
                              setResetAccountDraft(row.username || "");
                            }}
                          >
                            重置账号
                          </button>
                          <button
                            type="button"
                            className={inkBtn}
                            onClick={() => {
                              if (!window.confirm("确认重置该学生的登录密码吗？将生成随机密码。")) return;
                              resetPersonnelPasswordMut.mutate(row.id);
                            }}
                          >
                            改密
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
                          <span className="text-emerald-500">({ROLE_LABEL_MAP[row.role || "MEMBER"]})</span>
                        </span>
                      ) : (
                        <span className="text-[var(--twin-mute)]">-</span>
                      )}
                    </td>
                  ) : null}
                  {/* 手机端直达链接 + QR 码 */}
                  <PersonnelMobileTokenCell
                    userId={row.id}
                    userName={row.name || row.username}
                    role={row.role}
                  />
                  <td className="px-2 py-1.5 align-middle">
                    {row.contactEmail ? (
                      <button
                        type="button"
                        className="max-w-[12rem] truncate text-[11px] font-medium text-[var(--twin-link)] underline decoration-[var(--twin-link)]/30 underline-offset-2 hover:text-[var(--twin-link-deep)]"
                        onClick={() => {
                          setEmailEditOpen(row.id);
                          setEmailEditDraft(row.contactEmail ?? "");
                        }}
                      >
                        {row.contactEmail}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-[11px] text-[var(--twin-mute)] hover:text-[var(--twin-link)]"
                        onClick={() => {
                          setEmailEditOpen(row.id);
                          setEmailEditDraft("");
                        }}
                      >
                        未绑定
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    {row.sendKey ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        已绑定
                      </span>
                    ) : (
                      <span className="text-[11px] text-[var(--twin-mute)]">未绑定</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <select
                      disabled={row.id === BUILTIN_SUPER_ADMIN_ID}
                      value={row.role || "MEMBER"}
                      onChange={(e) => handleRoleChange(row.id, e.target.value)}
                      className={`${selectRoleCls} disabled:cursor-not-allowed disabled:bg-[var(--twin-canvas-soft)] disabled:text-[var(--twin-mute)] ${
                        hasMobileHtml5Privilege(row.role)
                          ? "border-amber-300 bg-amber-50/80 text-amber-900"
                          : ""
                      }`}
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
                              onClick={() => handleResetPin(row.id, row.name)}>
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
                          {isSuperAdmin && (row.role === "MEMBER" || String(row.role).includes("MEMBER")) ? (
                            (() => {
                              const binding = aroBindings[row.id];
                              const boundPersonnelId = binding?.aroUserId?.trim();
                              if (boundPersonnelId) {
                                return (
                                  <button
                                    type="button"
                                    className={`${inkBtn} border-amber-200 text-amber-700 hover:bg-amber-50`}
                                    title={`扫码 PIN 归属人员库学号 ${boundPersonnelId}，非本系统账号 ${row.id}`}
                                    onClick={() => jumpToPersonnelPinReset(boundPersonnelId, binding?.name)}
                                  >
                                    人员库重置PIN
                                  </button>
                                );
                              }
                              return (
                                <span
                                  className="text-[10px] text-[var(--twin-mute)] max-w-[8rem]"
                                  title="纯系统账号无人员库 PIN；扫码 PIN 请在「人员库」Tab 按被扫学生学号重置"
                                >
                                  PIN 见人员库
                                </span>
                              );
                            })()
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
              </div>
            )}
          </div>{/* 表格滚动区结束 */}

          {/* 翻页（shrink-0，始终可见） */}
          <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-t border-[var(--app-color-border-default)] text-sm">
            <span className="text-xs text-[var(--app-color-text-tertiary)]">共 {total} 条</span>
            <div className="flex items-center gap-2">
              <select
                value={size}
                onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}
                className="rounded border border-[var(--app-color-border-default)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] bg-[var(--app-color-surface-container)]"
              >
                {[10, 20, 30, 50].map((s) => (<option key={s} value={s}>{s}/页</option>))}
              </select>
              <AdminButton type="button" tone="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                上一页
              </AdminButton>
              <span className="text-xs text-[var(--app-color-text-secondary)]">{page} / {totalPages}</span>
              <AdminButton type="button" tone="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                下一页
              </AdminButton>
            </div>
          </div>

        </div>{/* 表格阴影容器结束 */}
      </div>{/* 外层 max-h 容器结束 */}

      {/* Portal 弹窗放在最外层，不参与 flex 布局 */}
      {createOpen && activeTab === "system" ? <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-md rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-5 shadow-twin-level-4">
            <h3 className="mb-3 text-base font-semibold text-[var(--twin-ink)]">新建员工账号</h3>
            <p className="mb-3 text-xs text-[var(--twin-mute)]">登录密码由你设置；新建账号首次登录需改密。不可创建平台所有者。</p>
            <div className="space-y-2 text-sm">
              <label className="block">
                <span className="text-[var(--twin-body)]">登录名</span>
                <input value={createUsername} onChange={(e) => setCreateUsername(e.target.value)} className="mt-1 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-[var(--twin-ink)] bg-[var(--twin-canvas)]" autoComplete="off" />
              </label>
              <label className="block">
                <span className="text-[var(--twin-body)]">密码</span>
                <input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} className="mt-1 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-[var(--twin-ink)] bg-[var(--twin-canvas)]" autoComplete="new-password" />
              </label>
              <label className="block">
                <span className="text-[var(--twin-body)]">展示昵称（可选）</span>
                <input value={createNickname} onChange={(e) => setCreateNickname(e.target.value)} maxLength={32} className="mt-1 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-[var(--twin-ink)] bg-[var(--twin-canvas)]" />
              </label>
              <label className="block">
                <span className="text-[var(--twin-body)]">角色</span>
                <select value={createRole} onChange={(e) => setCreateRole(e.target.value)} className="mt-1 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-[var(--twin-ink)] bg-[var(--twin-canvas)]">
                  {STAFF_CREATE_ROLE_OPTIONS.map((r) => (<option key={r} value={r}>{ROLE_LABEL_MAP[r]}</option>))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--twin-body)]" onClick={() => setCreateOpen(false)} disabled={createStaffMut.isPending}>取消</button>
              <button type="button" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={() => handleCreateStaff()} disabled={createStaffMut.isPending}>{createStaffMut.isPending ? "提交中…" : "创建"}</button>
            </div>
          </div>
        </div></Portal> : null}

      {detailOpen ? <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-4">
            <div className="border-b border-[var(--twin-hairline)] px-4 py-3 text-sm font-semibold text-[var(--twin-ink)]">{detailTitle}</div>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4 text-xs">
              {detailLines.map((line) => (<div key={line.k}><div className="text-[11px] text-[var(--twin-mute)]">{line.k}</div><div className="mt-0.5 break-all text-[var(--twin-ink)]">{line.v}</div></div>))}
            </div>
            <div className="flex justify-end border-t border-[var(--twin-hairline)] px-4 py-2">
              <button type="button" className="rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]" onClick={() => setDetailOpen(false)}>关闭</button>
            </div>
          </div>
        </div></Portal> : null}

      {nickOpen ? <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-sm rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-4">
            <div className="text-sm font-semibold text-[var(--twin-ink)]">修改展示昵称</div>
            <input value={nickDraft} onChange={(e) => setNickDraft(e.target.value)} maxLength={32} className="mt-3 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]" placeholder="最多 32 字" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-md border border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]" onClick={() => { setNickOpen(false); setNickRowId(""); setNickDraft(""); }}>取消</button>
              <button type="button" className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700" onClick={() => confirmNickDialog()}>确认</button>
            </div>
          </div>
        </div></Portal> : null}

      {resetAccountOpen ? <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-sm rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-4">
            <div className="text-sm font-semibold text-[var(--twin-ink)]">重置学生登录账号</div>
            <p className="mt-1 text-xs text-[var(--twin-mute)]">修改该人员的登录账号（用户名），人员库学号不变</p>
            <input
              value={resetAccountDraft}
              onChange={(e) => setResetAccountDraft(e.target.value)}
              maxLength={64}
              className="mt-3 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
              placeholder="新登录账号"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                onClick={() => { setResetAccountOpen(null); setResetAccountDraft(""); }}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
                disabled={resetPersonnelAccountMut.isPending || !resetAccountOpen || !resetAccountDraft.trim()}
                onClick={() => {
                  if (!resetAccountOpen || !resetAccountDraft.trim()) return;
                  resetPersonnelAccountMut.mutate(
                    { userId: resetAccountOpen, newUsername: resetAccountDraft.trim() },
                    {
                      onSuccess: () => {
                        setResetAccountOpen(null);
                        setResetAccountDraft("");
                      },
                    }
                  );
                }}
              >
                {resetPersonnelAccountMut.isPending ? "提交中…" : "确认"}
              </button>
            </div>
          </div>
        </div></Portal> : null}

      {emailEditOpen ? <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-sm rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-4">
            <div className="text-sm font-semibold text-[var(--twin-ink)]">修改联系邮箱</div>
            <p className="mt-1 text-xs text-[var(--twin-mute)]">
              为 <strong>{(() => { const r = personnelRows.find((p) => p.id === emailEditOpen); return r ? (r.name || r.username || emailEditOpen) : emailEditOpen; })()}</strong> 设置邮箱
            </p>
            <input
              type="email"
              value={emailEditDraft}
              onChange={(e) => setEmailEditDraft(e.target.value)}
              maxLength={128}
              className="mt-3 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
              placeholder="请输入邮箱地址"
              onKeyDown={(e) => {
                if (e.key === "Enter" && emailEditDraft.trim()) {
                  e.preventDefault();
                  const btn = document.getElementById("personnel-email-submit-btn") as HTMLButtonElement | null;
                  btn?.click();
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                onClick={() => { setEmailEditOpen(null); setEmailEditDraft(""); }}
              >
                取消
              </button>
              <button
                id="personnel-email-submit-btn"
                type="button"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
                disabled={emailEditSaving || !emailEditOpen || !emailEditDraft.trim()}
                onClick={async () => {
                  if (!emailEditOpen || !emailEditDraft.trim()) return;
                  setEmailEditSaving(true);
                  try {
                    const token = authStorage.getToken();
                    const res = await fetch(`/api/admin/personnel/${encodeURIComponent(emailEditOpen)}/contact-email`, {
                      method: "PUT",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: "Bearer " + token,
                      },
                      body: JSON.stringify({ email: emailEditDraft.trim() }),
                    });
                    if (!res.ok) {
                      const errData = await res.json().catch(() => ({}));
                      throw new Error((errData as any).message || "保存失败");
                    }
                    toast.success("邮箱已更新");
                    setEmailEditOpen(null);
                    setEmailEditDraft("");
                    refetchPersonnel();
                  } catch (e: any) {
                    toast.error(e?.message || "保存失败");
                  } finally {
                    setEmailEditSaving(false);
                  }
                }}
              >
                {emailEditSaving ? "提交中…" : "保存"}
              </button>
            </div>
          </div>
        </div></Portal> : null}

    </AdminPageShell>
  );
}
