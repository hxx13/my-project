import { useMemo, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { Portal } from "@/components/Portal";
import { WxPusherBindModal } from "@/components/shared/WxPusherBindModal";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import {
  useUnifiedPersonnel, usePersonnelRooms,
  useUpdateUserRole, useUpdateUserStatus, useResetUserPassword, useResetUserOpenId,
  useResetPersonnelAccount, useResetPersonnelPassword, useDeleteSystemUser,
} from "@/api/hooks/usePersonnel";
import {
  useIdentityTags, usePersonIdentityMap, useSetPersonIdentity,
  useCreateIdentityTag, useUpdateIdentityTag, useDeleteIdentityTag,
} from "@/api/hooks/usePersonIdentity";
import {
  fetchDepartments, fetchProjectGroups, syncUnifiedPersonnel, updatePersonnelField,
  viewUserPassword, type UnifiedPersonnelRecord, type UnifiedPersonnelFilter,
} from "@/api/domains/admin.api";
import { resetStudentPin } from "@/api/domains/specialChannel.api";
import { PersonnelFilterBar } from "@/features/personnel-admin/PersonnelFilterBar";
import { PersonnelRichList } from "@/features/personnel-admin/PersonnelRichList";
import { PersonnelDetailCard, BUILTIN_SUPER_ADMIN_ID } from "@/features/personnel-admin/PersonnelDetailCard";
import { PersonnelDictModal } from "@/features/personnel-admin/PersonnelDictModal";

export default function AdminPersonnelPage() {
  const role = authStorage.getRole() || "MEMBER";
  const isSuperAdmin = hasMinRole(role, "SUPER_ADMIN");

  // ── 筛选状态（服务端生效） ──
  const [filters, setFilters] = useState<UnifiedPersonnelFilter>({ accountType: "all" });
  const [applied, setApplied] = useState<UnifiedPersonnelFilter>({ accountType: "all" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);

  // ── 数据 ──
  const { data: unifiedData, isLoading, refetch: refetchUnified } = useUnifiedPersonnel(page, size, applied);
  const rows: UnifiedPersonnelRecord[] = unifiedData?.list ?? [];
  const total = unifiedData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / size));

  const { data: rooms = [] } = usePersonnelRooms();
  const { data: departments = [] } = useQueryByFetch(() => fetchDepartments());
  const { data: groups = [] } = useQueryByFetch(() => fetchProjectGroups());
  const { data: identityTags = [] } = useIdentityTags(isSuperAdmin);
  const identityMap = usePersonIdentityMap(isSuperAdmin);
  const setPersonIdentityMut = useSetPersonIdentity();
  const createIdentityTagMut = useCreateIdentityTag();
  const updateIdentityTagMut = useUpdateIdentityTag();
  const deleteIdentityTagMut = useDeleteIdentityTag();

  const [selected, setSelected] = useState<UnifiedPersonnelRecord | null>(null);
  const [dictOpen, setDictOpen] = useState(false);
  const [personnelDictOpen, setPersonnelDictOpen] = useState(false);
  const [resetAccountOpen, setResetAccountOpen] = useState<string | null>(null);
  const [resetAccountDraft, setResetAccountDraft] = useState("");
  const [emailEditOpen, setEmailEditOpen] = useState<string | null>(null);
  const [emailEditDraft, setEmailEditDraft] = useState("");
  const [sendKeyEditOpen, setSendKeyEditOpen] = useState<string | null>(null);
  const [sendKeyEditDraft, setSendKeyEditDraft] = useState("");
  const [wxEditOpen, setWxEditOpen] = useState<string | null>(null);
  const [identityPicker, setIdentityPicker] = useState<{ userId: string; x: number; y: number } | null>(null);
  const [identityDraft, setIdentityDraft] = useState<Set<number>>(new Set());
  const [detailPasswordCache, setDetailPasswordCache] = useState<Record<string, string | null>>({});

  // 各 mutation
  const updateRoleMut = useUpdateUserRole();
  const updateStatusMut = useUpdateUserStatus();
  const resetPasswordMut = useResetUserPassword();
  const resetOpenIdMut = useResetUserOpenId();
  const resetPersonnelAccountMut = useResetPersonnelAccount();
  const resetPersonnelPasswordMut = useResetPersonnelPassword();
  const deleteUserMut = useDeleteSystemUser();

  const applyFilters = (next: UnifiedPersonnelFilter) => {
    setFilters(next);
    setApplied(next);
    setPage(1);
  };

  const resetFilters = () => {
    const next: UnifiedPersonnelFilter = { accountType: "all" };
    setFilters(next);
    setApplied(next);
    setPage(1);
  };

  const viewPassword = async (userId: string): Promise<string | null> => {
    if (detailPasswordCache[userId] !== undefined) return detailPasswordCache[userId];
    try {
      const r = await viewUserPassword(userId);
      const plaintext = r.password ?? null;
      setDetailPasswordCache((p) => ({ ...p, [userId]: plaintext }));
      return plaintext;
    } catch {
      return null;
    }
  };

  const handleToggleStatus = (userId: string) => {
    const row = selected;
    const curOn = (row?.status ?? 1) !== 0;
    if (curOn) {
      if (!window.confirm("禁用后该账号将无法登录，是否继续？")) return;
      updateStatusMut.mutate({ id: userId, enabled: false });
    } else {
      if (!window.confirm("是否启用该账号？")) return;
      updateStatusMut.mutate({ id: userId, enabled: true });
    }
  };

  const handleResetAccount = (userId: string, current: string) => {
    setResetAccountOpen(userId);
    setResetAccountDraft(current);
  };

  const handleResetPassword = (userId: string) => {
    if (userId === BUILTIN_SUPER_ADMIN_ID) return;
    if (!window.confirm("确认重置该账号密码吗？")) return;
    const isStaff = String(userId).startsWith("STAFF_");
    if (isStaff) resetPasswordMut.mutate(userId);
    else resetPersonnelPasswordMut.mutate(userId);
  };

  const handleResetPin = (aroUserId: string, displayName: string) => {
    if (!aroUserId) return;
    if (!window.confirm(`确认重置人员库学号 ${displayName}（${aroUserId}）的扫码个人密码（PIN）吗？`)) return;
    resetStudentPin(aroUserId)
      .then(() => toast.success(`已重置 ${displayName} 的 PIN`))
      .catch((e) => toast.error(e instanceof Error ? e.message : "重置 PIN 失败"));
  };

  const handleSaveField = (field: "job_number" | "department_name" | "project_group_name" | "user_type_names", value: string) => {
    if (!selected) return;
    updatePersonnelField(selected.id, field, value)
      .then(() => { toast.success("已保存"); refetchUnified(); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "保存失败"));
  };

  const openIdentityPicker = (userId: string, anchor: { x: number; y: number }) => {
    const current = identityMap.data?.get(userId) ?? [];
    setIdentityDraft(new Set(current.map((t) => t.id)));
    setIdentityPicker({ userId, x: anchor.x, y: anchor.y });
  };

  const toggleIdentityDraft = (id: number) => {
    const next = new Set(identityDraft);
    if (next.has(id)) next.delete(id); else next.add(id);
    setIdentityDraft(next);
    if (identityPicker) {
      setPersonIdentityMut.mutate({ userId: identityPicker.userId, tagIds: Array.from(next) });
    }
  };

  const location = useLocation();
  const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);

  return (
    <AdminPageShell>
      <div className="flex h-full min-h-0 flex-col gap-3">
        {/* 筛选卡 */}
        <AdminFormCard className="shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
            <h2 className="text-base font-bold text-[var(--app-color-text-primary)]">{pageLabel}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {isSuperAdmin ? (
                <>
                  <AdminButton type="button" tone="secondary" size="sm" onClick={() => setDictOpen(true)}>身份字典管理</AdminButton>
                  <AdminButton type="button" tone="secondary" size="sm" onClick={() => setPersonnelDictOpen(true)}>字典配置</AdminButton>
                </>
              ) : null}
              {isSuperAdmin ? (
                <AdminButton type="button" tone="secondary" size="sm" onClick={async () => {
                  try {
                    const r = await syncUnifiedPersonnel();
                    toast.success(`已同步：学生 ${r?.students ?? 0}、教职工 ${r?.staff ?? 0} → 统一 ${r?.unified ?? 0} 人`);
                    refetchUnified();
                  } catch (e) { toast.error(e instanceof Error ? e.message : "同步失败"); }
                }}>同步人员</AdminButton>
              ) : null}
              <AdminButton type="button" tone="secondary" size="sm" onClick={() => refetchUnified()}>刷新</AdminButton>
            </div>
          </div>
          <PersonnelFilterBar
            value={filters}
            onChange={setFilters}
            onApply={applyFilters}
            onReset={resetFilters}
            options={{ departments, groups, identityTags, rooms }}
            total={total}
          />
        </AdminFormCard>

        {/* 列表 + 卡片 */}
        <div className="flex min-h-0 flex-1 gap-3">
          <PersonnelRichList
            rows={rows}
            total={total}
            page={page}
            pageSize={size}
            totalPages={totalPages}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onPageChange={setPage}
            onPageSizeChange={setSize}
            identityMap={identityMap.data ?? new Map()}
            onQuickResetPassword={(row) => handleResetPassword(row.staffId || row.aroUserId || "")}
            isLoading={isLoading}
          />
          {selected ? (
            <PersonnelDetailCard
              row={selected}
              isSuperAdmin={isSuperAdmin}
              identityMap={identityMap.data ?? new Map()}
              onClose={() => setSelected(null)}
              onRoleChange={(userId, r) => { updateRoleMut.mutate({ id: userId, role: r }); }}
              onToggleStatus={handleToggleStatus}
              onResetPassword={handleResetPassword}
              onResetAccount={handleResetAccount}
              onResetPin={handleResetPin}
              onResetOpenId={(userId) => {
                if (!window.confirm("确认重置该账号的 openId 绑定吗？")) return;
                resetOpenIdMut.mutate(userId);
              }}
              onDelete={(userId) => {
                if (!window.confirm("确定永久删除该账号吗？此操作不可恢复。")) return;
                if (!window.confirm("请再次确认：删除后无法恢复，是否继续？")) return;
                deleteUserMut.mutate(userId);
              }}
              onSaveField={handleSaveField}
              onEditEmail={(userId, current) => { setEmailEditOpen(userId); setEmailEditDraft(current); }}
              onEditSendKey={(userId, current) => { setSendKeyEditOpen(userId); setSendKeyEditDraft(current); }}
              onEditWx={setWxEditOpen}
              onOpenIdentityPicker={openIdentityPicker}
              onViewPassword={viewPassword}
            />
          ) : null}
        </div>
      </div>

      {/* 弹窗区 */}
      {dictOpen ? <IdentityDictModal onClose={() => setDictOpen(false)}
        tags={identityTags}
        onCreate={(code, label) => createIdentityTagMut.mutate({ code, label })}
        onUpdate={(id, label) => updateIdentityTagMut.mutate({ id, body: { label } })}
        onDelete={(t) => {
          if (!window.confirm(`确认删除身份标签「${t.label}」吗？`)) return;
          deleteIdentityTagMut.mutate(t.id);
        }}
      /> : null}
      {personnelDictOpen ? <PersonnelDictModal onClose={() => setPersonnelDictOpen(false)} /> : null}

      {resetAccountOpen ? (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
            <div className="w-full max-w-sm rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-4">
              <div className="text-sm font-semibold text-[var(--twin-ink)]">重置登录账号</div>
              <input value={resetAccountDraft} onChange={(e) => setResetAccountDraft(e.target.value)} maxLength={64}
                className="mt-3 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]" placeholder="新登录账号" />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-md border border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)]" onClick={() => { setResetAccountOpen(null); setResetAccountDraft(""); }}>取消</button>
                <button type="button" disabled={!resetAccountOpen || !resetAccountDraft.trim()} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                  onClick={() => {
                    if (!resetAccountOpen || !resetAccountDraft.trim()) return;
                    resetPersonnelAccountMut.mutate({ userId: resetAccountOpen, newUsername: resetAccountDraft.trim() }, { onSuccess: () => { setResetAccountOpen(null); setResetAccountDraft(""); } });
                  }}>
                  {resetPersonnelAccountMut.isPending ? "提交中…" : "确认"}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {emailEditOpen ? (
        <Portal>
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog">
            <div className="w-full max-w-sm rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-4">
              <div className="text-sm font-semibold text-[var(--twin-ink)]">修改联系邮箱</div>
              <input type="email" value={emailEditDraft} onChange={(e) => setEmailEditDraft(e.target.value)} maxLength={128}
                className="mt-3 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]" placeholder="请输入邮箱地址" />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-md border border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)]" onClick={() => { setEmailEditOpen(null); setEmailEditDraft(""); }}>取消</button>
                <button type="button" disabled={!emailEditOpen || !emailEditDraft.trim()} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                  onClick={async () => {
                    if (!emailEditOpen) return;
                    const token = authStorage.getToken();
                    try {
                      const res = await fetch(`/api/admin/personnel/${encodeURIComponent(emailEditOpen)}/contact-email`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                        body: JSON.stringify({ email: emailEditDraft.trim() }),
                      });
                      const json = await res.json();
                      if (json?.success) { toast.success("邮箱已更新"); setEmailEditOpen(null); setEmailEditDraft(""); }
                      else toast.error(json?.message || "保存失败");
                    } catch { toast.error("保存失败"); }
                  }}>保存</button>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {sendKeyEditOpen ? (
        <Portal>
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog">
            <div className="w-full max-w-sm rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-4">
              <div className="text-sm font-semibold text-[var(--twin-ink)]">设置微信通知 SendKey</div>
              <input type="text" value={sendKeyEditDraft} onChange={(e) => setSendKeyEditDraft(e.target.value)} maxLength={256}
                className="mt-3 w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]" placeholder="请输入 SendKey" />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-md border border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)]" onClick={() => { setSendKeyEditOpen(null); setSendKeyEditDraft(""); }}>取消</button>
                <button type="button" disabled={!sendKeyEditOpen || !sendKeyEditDraft.trim()} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                  onClick={async () => {
                    if (!sendKeyEditOpen) return;
                    const token = authStorage.getToken();
                    try {
                      const res = await fetch(`/api/admin/personnel/${encodeURIComponent(sendKeyEditOpen)}/send-key`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                        body: JSON.stringify({ sendKey: sendKeyEditDraft.trim() }),
                      });
                      const json = await res.json();
                      if (json?.success) { toast.success("SendKey 已更新"); setSendKeyEditOpen(null); setSendKeyEditDraft(""); }
                      else toast.error(json?.message || "保存失败");
                    } catch { toast.error("保存失败"); }
                  }}>保存</button>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      <WxPusherBindModal
        key={wxEditOpen ?? "new"}
        open={wxEditOpen !== null}
        onClose={() => setWxEditOpen(null)}
        personnelId={wxEditOpen ?? ""}
        personName={selected?.name ?? wxEditOpen ?? ""}
        initialValue={selected?.wxPusherUid || undefined}
        authToken={authStorage.getToken()}
        onSaved={() => { setWxEditOpen(null); refetchUnified(); }}
      />

      {identityPicker ? (
        <Portal>
          <div className="fixed inset-0 z-40" onClick={() => setIdentityPicker(null)} />
          <div className="fixed z-50 w-56 rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-2 shadow-twin-level-4"
            style={{ left: identityPicker.x, top: identityPicker.y }}>
            {identityTags.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-[var(--twin-mute)]">暂无可配置的身份标签，请先在身份字典管理中新增</div>
            ) : (
              <div className="max-h-56 space-y-0.5 overflow-y-auto">
                {identityTags.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--twin-canvas-soft)]">
                    <input type="checkbox" checked={identityDraft.has(t.id)} onChange={() => toggleIdentityDraft(t.id)} className="h-3.5 w-3.5 accent-[var(--twin-ink)]" />
                    <span className="text-xs text-[var(--twin-body)]">{t.label}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="mt-2 flex justify-end border-t border-[var(--twin-hairline)] pt-2">
              <button type="button" className="rounded-md bg-[var(--twin-canvas-soft)] px-3 py-1 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]" onClick={() => setIdentityPicker(null)}>完成</button>
            </div>
          </div>
        </Portal>
      ) : null}
    </AdminPageShell>
  );
}

/** 简易字典 hook：仅挂载时拉取一次（部门/课题组字典） */
function useQueryByFetch<T>(fn: () => Promise<T>): { data: T | undefined } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [ran, setRan] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ran) return;
    setRan(true);
    let on = true;
    fn().then((d) => { if (on) setData(d); }).catch(() => {});
    return () => { on = false; };
  }, []);
  return { data };
}

/** 身份字典管理弹窗 */
function IdentityDictModal({ onClose, tags, onCreate, onUpdate, onDelete }: {
  onClose: () => void;
  tags: { id: number; label: string }[];
  onCreate: (code: string, label: string) => void;
  onUpdate: (id: number, label: string) => void;
  onDelete: (t: { id: number; label: string }) => void;
}) {
  const [newTagCode, setNewTagCode] = useState("");
  const [newTagLabel, setNewTagLabel] = useState("");
  const [tagEditId, setTagEditId] = useState<number | null>(null);
  const [tagEditLabel, setTagEditLabel] = useState("");
  const inkBtn = "inline-flex shrink-0 items-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--twin-body)] shadow-sm hover:bg-[var(--twin-canvas-soft)]";
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
        <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-4">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--twin-hairline)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--twin-ink)]">身份字典管理</h3>
            <button type="button" className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-body)]" onClick={onClose}>关闭</button>
          </div>
          <div className="shrink-0 border-b border-[var(--twin-hairline)] px-4 py-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="text-[11px] text-[var(--twin-mute)]">身份标识 code</span>
                <input value={newTagCode} onChange={(e) => setNewTagCode(e.target.value)} placeholder="例如：GROUP_LEADER" autoComplete="off" className="mt-0.5 block w-44 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5 font-mono text-xs text-[var(--twin-ink)]" />
              </label>
              <label className="block">
                <span className="text-[11px] text-[var(--twin-mute)]">身份名称</span>
                <input value={newTagLabel} onChange={(e) => setNewTagLabel(e.target.value)} placeholder="例如：组长" autoComplete="off" className="mt-0.5 block w-44 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5 text-xs text-[var(--twin-ink)]" />
              </label>
              <AdminButton type="button" tone="primary" size="sm" onClick={() => {
                const code = newTagCode.trim(); const label = newTagLabel.trim();
                if (!code) { toast.error("请填写身份标识 code"); return; }
                if (!label) { toast.error("请填写身份名称"); return; }
                onCreate(code, label); setNewTagCode(""); setNewTagLabel("");
              }}>新增</AdminButton>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {tags.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--twin-hairline)] px-3 py-8 text-center text-xs text-[var(--twin-mute)]">暂无身份标签，请在上方新增</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--twin-hairline)] text-[var(--twin-mute)]">
                    <th className="py-1.5 pr-2 font-medium">名称</th>
                    <th className="py-1.5 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tags.map((t) => (
                    <tr key={t.id} className="border-b border-[var(--twin-hairline)]">
                      <td className="py-1.5 pr-2">
                        {tagEditId === t.id ? (
                          <input value={tagEditLabel} onChange={(e) => setTagEditLabel(e.target.value)}
                            className="w-32 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-xs text-[var(--twin-ink)]"
                            onKeyDown={(e) => { if (e.key === "Enter") { onUpdate(t.id, tagEditLabel.trim()); setTagEditId(null); } if (e.key === "Escape") setTagEditId(null); }} />
                        ) : <span className="text-[var(--twin-ink)]">{t.label}</span>}
                      </td>
                      <td className="py-1.5">
                        <div className="flex items-center gap-1">
                          {tagEditId === t.id ? (
                            <>
                              <button type="button" className={inkBtn} onClick={() => { onUpdate(t.id, tagEditLabel.trim()); setTagEditId(null); }}>保存</button>
                              <button type="button" className={inkBtn} onClick={() => setTagEditId(null)}>取消</button>
                            </>
                          ) : (
                            <button type="button" className={inkBtn} onClick={() => { setTagEditId(t.id); setTagEditLabel(t.label); }}>编辑</button>
                          )}
                          <button type="button" className={`${inkBtn} border-rose-200 text-rose-700 hover:bg-rose-50`} onClick={() => onDelete(t)}>删除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
