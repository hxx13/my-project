import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { usePrefersReducedMotion } from "@/hooks/useTypewriterText";
import { Briefcase, GraduationCap, Mail, Send, Smartphone, Building2, IdCard, ShieldCheck } from "lucide-react";
import { toast } from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/hooks/queryKeys";
import type { UnifiedPersonnelRecord } from "@/api/domains/admin.api";
import { fetchPersonnelRoomAuthorization, updatePersonnelRoomAuthorization, fetchUnifiedPersonnel, mergePersonnel, updatePersonnelHead, resetPersonnelHead, syncPersonnel, fetchDepartments, fetchProjectGroups, updatePersonnelOrg, movePersonnelToTrash, restorePersonnel, purgePersonnel, type PersonnelRoomAuthorization } from "@/api/domains/admin.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { fetchPersonnelSignature, resetPersonnelSignature, type MySignature } from "@/api/domains/signature.api";
import { fetchRoomMappingRooms, type RoomMappingRoomRow } from "@/api/twinApi";
import type { IdentityTag } from "@/api/domains/personIdentity.api";
import { hasMinRole } from "@/features/auth/roleAccess";
import { AdminButton } from "@/components/admin/AdminButton";
import SearchSelect, { type SearchOption } from "@/components/cage/SearchSelect";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, SysBadge, StatusPill, ROLE_LABEL_MAP } from "./PersonnelRichList";

// 直接进入本页（不经 AUP 页面）也能保证 useGSAP 生效；registerPlugin 幂等
gsap.registerPlugin(useGSAP);

export const BUILTIN_SUPER_ADMIN_ID = "SYS_SUPER_ROOT";
export const ROLE_OPTIONS = ["MEMBER", "STAFF", "SENIOR", "ADMIN", "SUPER_ADMIN", "PLATFORM_OWNER"];

interface Props {
  row: UnifiedPersonnelRecord;
  isSuperAdmin: boolean;
  identityMap: Map<string, IdentityTag[]>;
  onClose: () => void;
  // 操作回调（由编排页注入）
  onRoleChange: (userId: string, role: string) => void;
  onToggleStatus: (userId: string) => void;
  onResetPassword: (userId: string) => void;
  onResetAccount: (userId: string, current: string) => void;
  onResetPin: (aroUserId: string, name: string) => void;
  onResetOpenId: (userId: string) => void;
  onDelete: (userId: string) => void;
  onSaveField: (field: "name" | "job_number" | "department_name" | "project_group_name" | "user_type_names", value: string) => void;
  onEditEmail: (userId: string, current: string) => void;
  onEditSendKey: (userId: string, current: string) => void;
  onEditWx: (userId: string) => void;
  onOpenIdentityPicker: (userId: string, anchor: { x: number; y: number }) => void;
  onViewPassword: (userId: string) => Promise<string | null>;
}

export function PersonnelDetailCard({
  row, isSuperAdmin, identityMap, onClose,
  onRoleChange, onToggleStatus, onResetPassword, onResetAccount, onResetPin,
  onResetOpenId, onDelete, onSaveField, onEditEmail, onEditSendKey, onEditWx,
  onOpenIdentityPicker, onViewPassword,
}: Props) {
  // ── 主从并排「挤压」：外层 wrapper 动画 flexBasis 0→target，列表宽度同步收缩；
  //    内层卡片填充 wrapper（overflow:hidden 裁剪），面板从右边缘向左抽出揭示 ──
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const closingRef = useRef(false);
  const qc = useQueryClient();
  const headFileRef = useRef<HTMLInputElement>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [deptOptions, setDeptOptions] = useState<SearchOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<SearchOption[]>([]);

  // 字典全量拉一次，搜索选择走内存过滤（部门 32 条、课题组 274 条，无需远程搜索）
  useEffect(() => {
    let on = true;
    fetchDepartments().then((d) => { if (on) setDeptOptions(d.map((x) => ({ key: String(x.id), label: x.name }))); }).catch(() => {});
    fetchProjectGroups().then((g) => { if (on) setGroupOptions(g.map((x) => ({ key: String(x.id), label: x.name, subtitle: x.departmentName ?? undefined }))); }).catch(() => {});
    return () => { on = false; };
  }, []);

  useGSAP(() => {
    if (!wrapRef.current || !innerRef.current) return;
    closingRef.current = false;
    tlRef.current?.kill();
    tlRef.current = null;

    // 50/50 平分：抽屉占行容器 50% 宽，列表留 50%
    const TARGET = "50%";

    if (reducedMotion) {
      gsap.set(wrapRef.current, { flexBasis: TARGET });
      gsap.set(innerRef.current, { opacity: 1 });
      return;
    }
    gsap.set(wrapRef.current, { flexBasis: "0%" });
    tlRef.current = gsap
      .timeline()
      .to(wrapRef.current, { flexBasis: TARGET, duration: 0.45, ease: "power3.out" })
      .fromTo(innerRef.current, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0);
    return () => {
      tlRef.current?.kill();
      tlRef.current = null;
    };
  }, { scope: wrapRef, dependencies: [row.id] });

  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (reducedMotion || !wrapRef.current || !innerRef.current) {
      onClose();
      return;
    }
    tlRef.current?.kill();
    // 存入 tlRef：切换行时 useGSAP cleanup 会 kill 掉进行中的退场，避免覆盖新选中
    tlRef.current = gsap
      .timeline({ onComplete: onClose })
      .to(wrapRef.current, { flexBasis: "0%", duration: 0.35, ease: "power2.inOut" })
      .to(innerRef.current, { opacity: 0, duration: 0.25 }, 0);
  };

  // Esc 关闭详情
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  const onPickHeadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (row.headOverride && !window.confirm("该人员已有自定义头像，确定用新图替换？")) return;
    try {
      const { url } = await uploadSingleImage(file);
      await updatePersonnelHead(row.id, url);
      toast.success("头像已更新");
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  const onResetHead = async () => {
    if (!window.confirm("确定清除本地头像，恢复原始头像？")) return;
    try {
      await resetPersonnelHead(row.id);
      toast.success("头像已重置");
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  const onSync = async () => {
    setSyncLoading(true);
    try {
      const r = await syncPersonnel(row.id);
      toast.success(`已同步：学生侧 ${r.aroMatched} 条、教职工侧 ${r.staffMatched} 条`);
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "同步失败");
    } finally {
      setSyncLoading(false);
    }
  };

  // 改部门/课题组：写字典 id + 文本快照（id 是权威，展示走字典当前名）
  const onChangeOrg = async (kind: "department" | "group", opt: SearchOption) => {
    try {
      await updatePersonnelOrg(row.id, kind, Number(opt.key), opt.label);
      toast.success("已保存");
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    }
  };

  const uid = row.staffId || "";
  const personId = String(row.id);
  const isBuiltin = uid === BUILTIN_SUPER_ADMIN_ID;
  const isStaff = hasMinRole(row.role || "MEMBER", "STAFF");
  // 只看教职工账号（STAFF_）；学生账号挂在 aro_user_id 列，不算「有教职工账号」
  const hasAccount = Boolean(row.staffId);
  const tags = identityMap.get(personId) ?? [];

  const inkBtn =
    "inline-flex shrink-0 items-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--twin-body)] shadow-sm hover:bg-[var(--twin-canvas-soft)] disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div
      ref={wrapRef}
      className="relative overflow-hidden rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-4"
      style={{ flexGrow: 0, flexShrink: 0, flexBasis: "0%", minHeight: 0 }}
    >
      <div ref={innerRef} className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* 头部 */}
      <header className="flex items-start gap-4 border-b border-[var(--twin-hairline)] p-4">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <Avatar name={row.name} head={row.head} size="lg" />
          <div className="flex gap-1">
            <AdminButton type="button" tone="secondary" size="sm" onClick={() => headFileRef.current?.click()}>上传头像</AdminButton>
            {row.headOverride ? (
              <AdminButton type="button" tone="secondary" size="sm" onClick={onResetHead}>重置头像</AdminButton>
            ) : null}
            <AdminButton type="button" tone="secondary" size="sm" loading={syncLoading} onClick={onSync}>同步此人</AdminButton>
          </div>
          <input ref={headFileRef} type="file" accept="image/*" className="hidden" onChange={onPickHeadFile} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 text-lg font-bold text-[var(--twin-ink)]">
              <EditableText label="姓名" value={row.name || ""} onSave={(v) => onSaveField("name", v)} emphasize />
            </div>
            <SysBadge hasAccount={hasAccount} />
            <StatusPill hasAccount={hasAccount} status={row.status} />
          </div>
          <div className="mt-1 truncate text-xs text-[var(--twin-mute)]">
            {[row.userTypeNames, row.departmentName, row.projectGroupName].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <button type="button" onClick={handleClose}
          className="shrink-0 rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]">✕</button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* 双身份两栏对照 */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {row.staffId ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-blue-800"><Briefcase className="h-3.5 w-3.5" />教职工账号</div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between gap-2"><span className="shrink-0 text-[var(--twin-mute)]">ID</span><span className="break-all text-right font-mono text-[var(--twin-body)]">{row.staffId}</span></div>
                <div className="flex justify-between gap-2"><span className="shrink-0 text-[var(--twin-mute)]">账号名</span><span className="break-all text-right font-mono text-[var(--twin-body)]">{row.staffUsername || row.staffId}</span></div>
                <div className="flex items-center justify-between gap-2"><span className="shrink-0 text-[var(--twin-mute)]">密码</span>{isBuiltin ? <span className="text-[var(--twin-mute)]">受保护</span> : <PwdCell userId={row.staffId} onViewPassword={onViewPassword} />}</div>
              </div>
              {isSuperAdmin && !isBuiltin ? (
                <div className="mt-2 flex gap-1 border-t border-blue-100 pt-2">
                  <button type="button" className={inkBtn} onClick={() => onResetAccount(row.staffId!, row.staffUsername || row.staffId!)}>重置账号</button>
                  <button type="button" className={inkBtn} onClick={() => onResetPassword(row.staffId!)}>重置密码</button>
                </div>
              ) : null}
            </div>
          ) : null}
          {row.aroUserId ? (
            <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-amber-800"><GraduationCap className="h-3.5 w-3.5" />学生账号</div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between gap-2"><span className="shrink-0 text-[var(--twin-mute)]">认证 ID</span><span className="break-all text-right font-mono text-[var(--twin-body)]">{row.aroUserId}</span></div>
                <div className="flex justify-between gap-2"><span className="shrink-0 text-[var(--twin-mute)]">账号名</span><span className="break-all text-right font-mono text-[var(--twin-body)]">{row.studentUsername && row.studentUsername !== row.aroUserId ? row.studentUsername : "未注册"}</span></div>
                <div className="flex items-center justify-between gap-2"><span className="shrink-0 text-[var(--twin-mute)]">密码</span>{row.aroUserId === BUILTIN_SUPER_ADMIN_ID ? <span className="text-[var(--twin-mute)]">受保护</span> : <PwdCell userId={row.aroUserId} onViewPassword={onViewPassword} />}</div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-amber-100 pt-2 text-[11px]">
                <span className="text-[var(--twin-mute)]">扫码 PIN（独立验证密码）</span>
                <button type="button" className="text-[var(--twin-link)] hover:underline" onClick={() => onResetPin(row.aroUserId!, row.name)}>重置 PIN</button>
              </div>
              {isSuperAdmin ? (
                <div className="mt-2 flex gap-1 border-t border-amber-100 pt-2">
                  <button type="button" className={inkBtn} onClick={() => onResetAccount(row.aroUserId!, row.aroUserId!)}>重置账号</button>
                  <button type="button" className={inkBtn} onClick={() => onResetPassword(row.aroUserId!)}>重置密码</button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* 通知绑定三列 */}
        <section className="rounded-lg border border-[var(--twin-hairline)] p-3">
          <div className="mb-2 text-[11px] font-semibold text-[var(--twin-mute)]">通知绑定</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--twin-mute)]"><Mail className="h-3 w-3" />邮箱</div>
              <div className="mt-1 truncate text-[11px] font-medium text-[var(--twin-body)]" title={row.contactEmail || undefined}>{row.contactEmail || <span className="text-[var(--twin-mute)]">未绑定</span>}</div>
              <button type="button" className="mt-1 text-[11px] text-[var(--twin-link)] hover:underline" onClick={() => onEditEmail(uid || row.aroUserId || "", row.contactEmail ?? "")}>{row.contactEmail ? "修改" : "设置"}</button>
            </div>
            <div className="rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--twin-mute)]"><Send className="h-3 w-3" />Server酱</div>
              <div className="mt-1 text-[11px] font-medium text-[var(--twin-body)]">{row.sendKey ? "已绑定" : <span className="text-[var(--twin-mute)]">未绑定</span>}</div>
              <button type="button" className="mt-1 text-[11px] text-[var(--twin-link)] hover:underline" onClick={() => onEditSendKey(uid || row.aroUserId || "", row.sendKey ?? "")}>{row.sendKey ? "修改" : "设置"}</button>
            </div>
            <div className="rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--twin-mute)]"><Smartphone className="h-3 w-3" />WxPusher</div>
              <div className="mt-1 text-[11px] font-medium text-[var(--twin-body)]">{row.wxPusherUid ? "已绑定" : <span className="text-[var(--twin-mute)]">未绑定</span>}</div>
              <button type="button" className="mt-1 text-[11px] text-[var(--twin-link)] hover:underline" onClick={() => onEditWx(uid || row.aroUserId || "")}>{row.wxPusherUid ? "修改" : "设置"}</button>
            </div>
          </div>
        </section>

        {/* 组织与资料双列 */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--twin-hairline)] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--twin-mute)]"><Building2 className="h-3.5 w-3.5" />组织信息</div>
            <DictSelect label="部门" value={row.departmentName || ""} options={deptOptions} onPick={(o) => onChangeOrg("department", o)} />
            <DictSelect label="课题组" value={row.projectGroupName || ""} options={groupOptions} onPick={(o) => onChangeOrg("group", o)} />
            <div className="flex justify-between gap-2 py-0.5 text-[11px]"><span className="text-[var(--twin-mute)]">校内</span><span className="text-[var(--twin-body)]">{row.isSchool === 1 ? "是" : row.isSchool === 0 ? "否" : "—"}</span></div>
          </div>
          <div className="rounded-lg border border-[var(--twin-hairline)] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--twin-mute)]"><IdCard className="h-3.5 w-3.5" />身份与联系</div>
            <EditableText label="工号" value={row.jobNumber || ""} onSave={(v) => onSaveField("job_number", v)} />
            <EditableText label="类型" value={row.userTypeNames || ""} onSave={(v) => onSaveField("user_type_names", v)} />
            <div className="flex justify-between gap-2 py-0.5 text-[11px]"><span className="text-[var(--twin-mute)]">手机</span><span className="text-[var(--twin-body)]">{row.mobilePhone || "—"}</span></div>
            <div className="flex justify-between gap-2 py-0.5 text-[11px]">
              <span className="shrink-0 text-[var(--twin-mute)]">房间授权</span>
              <RoomAuthorizationField personId={row.id} fallbackZh={row.allowedRoomsDisplayZh} fallbackOfficial={row.hasOfficialRoomPermission} />
            </div>
          </div>
        </section>

        {/* 身份标识 */}
        {isSuperAdmin ? (
          <section className="rounded-lg border border-[var(--twin-hairline)] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--twin-mute)]"><ShieldCheck className="h-3.5 w-3.5" />身份标识</div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex flex-wrap gap-1">
                {tags.length === 0 ? (<span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">实验员（默认）</span>) : tags.map((t) => (<span key={t.id} className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-800">{t.label}</span>))}
              </span>
              <button type="button" className="text-[11px] text-[var(--twin-link)] hover:underline"
                onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onOpenIdentityPicker(personId, { x: r.left, y: r.bottom + 4 }); }}>
                设置
              </button>
            </div>
          </section>
        ) : null}

        {/* 操作栏 */}
        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
          <span className="text-[11px] text-[var(--twin-mute)]">角色</span>
          <select disabled={isBuiltin} value={row.role || "MEMBER"}
            onChange={(e) => onRoleChange(personId, e.target.value)}
            className="h-7 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 text-[11px] text-[var(--twin-body)]">
            {ROLE_OPTIONS.map((r) => (<option key={r} value={r}>{ROLE_LABEL_MAP[r]}</option>))}
          </select>
          {hasAccount ? (
            <button type="button" disabled={isBuiltin} onClick={() => onToggleStatus(uid)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${row.status === 0 ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {row.status === 0 ? "已禁用" : "启用中"}
            </button>
          ) : (
            <span className="text-[11px] text-[var(--twin-mute)]">
              {row.studentUsername ? "无教职工账号（学生账号见下方）" : "无教职工账号"}
            </span>
          )}
          {isSuperAdmin && !isBuiltin && hasAccount ? (
            <>
              <button type="button" className={inkBtn} onClick={() => onResetOpenId(uid)}>重置绑定</button>
              {isStaff ? (
                <button type="button" className={`${inkBtn} border-rose-200 text-rose-700 hover:bg-rose-50`} onClick={() => onDelete(uid)}>删除</button>
              ) : null}
            </>
          ) : null}
        </section>

        {/* 合并档案（不可逆，仅 SUPER_ADMIN） */}
        {isSuperAdmin ? (
          <section className="rounded-lg border border-[var(--twin-hairline)] p-3">
            <div className="mb-2 text-[11px] font-semibold text-[var(--twin-mute)]">合并档案</div>
            <MergePersonnelField row={row} onClose={onClose} />
          </section>
        ) : null}
        {/* 电子签名：查看 + 重置。签名一经提交不可更改，重置是唯一的修改途径 */}
        <SignatureSection row={row} isSuperAdmin={isSuperAdmin} />

        {/* 回收站（仅 SUPER_ADMIN）：软删除可恢复；彻底删除不可逆 */}
        {isSuperAdmin ? (
          <section className="rounded-lg border border-[var(--twin-hairline)] p-3">
            <div className="mb-2 text-[11px] font-semibold text-[var(--twin-mute)]">回收站</div>
            <TrashActions row={row} onClose={onClose} />
          </section>
        ) : null}
        </div>
      </div>
    </div>
  );
}

/** 电子签名：查看 + 重置（仅 SUPER_ADMIN 可重置）。签名不可更改，重置是唯一的修改途径。 */
function SignatureSection({ row, isSuperAdmin }: { row: UnifiedPersonnelRecord; isSuperAdmin: boolean }) {
  const qc = useQueryClient();
  const [sig, setSig] = useState<MySignature | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const s = await fetchPersonnelSignature(row.id);
        if (!dead) setSig(s);
      } catch {
        if (!dead) setSig({ hasSignature: false });
      }
    })();
    return () => { dead = true; };
  }, [row.id]);

  const handleReset = async () => {
    if (!window.confirm("重置后该签名会被清空，本人可以重新签。确定重置？")) return;
    setBusy(true);
    try {
      await resetPersonnelSignature(row.id);
      toast.success("已重置签名");
      setSig({ hasSignature: false });
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重置失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-[var(--twin-hairline)] p-3">
      <div className="mb-2 text-[11px] font-semibold text-[var(--twin-mute)]">电子签名</div>
      {sig === null ? (
        <div className="text-xs text-[var(--twin-mute)]">加载中…</div>
      ) : !sig.hasSignature ? (
        <div className="text-xs text-[var(--twin-mute)]">未签名</div>
      ) : (
        <>
          <img src={sig.imageData} alt="电子签名"
            className="w-full max-w-[520px] rounded border border-[var(--twin-hairline)] bg-white" />
          <p className="mt-1 text-[10px] text-[var(--twin-mute)]">
            {sig.createdAt ? `签署于 ${sig.createdAt}` : "已签署"} · 签名不可更改
          </p>
          {isSuperAdmin ? (
            <div className="mt-2">
              <AdminButton type="button" tone="secondary" size="sm" disabled={busy} onClick={handleReset}>
                重置签名
              </AdminButton>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/** 回收站操作：软删（可恢复）/ 恢复 / 彻底删除（不可逆）。仅 SUPER_ADMIN。 */
function TrashActions({ row, onClose }: { row: UnifiedPersonnelRecord; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  if (row.deletedAt) {
    return (
      <div className="flex flex-wrap gap-2">
        <AdminButton type="button" tone="secondary" size="sm" disabled={busy}
          onClick={() => void run("已恢复到人员列表", () => restorePersonnel(row.id))}>
          恢复到人员列表
        </AdminButton>
        <AdminButton type="button" tone="secondary" size="sm" disabled={busy}
          onClick={() => {
            if (!window.confirm(
              "彻底删除不可恢复：会同时删掉他在 ARO 侧的人员记录与登录账号。\n"
              + "注意：若这个人来自 ARO 同步，下次同步可能还会把他加回来（ARO 才是权威源）。\n"
              + "确定继续？")) return;
            void run("已彻底删除", () => purgePersonnel(row.id)).then(onClose);
          }}>
          彻底删除
        </AdminButton>
      </div>
    );
  }

  return (
    <AdminButton type="button" tone="secondary" size="sm" disabled={busy}
      onClick={() => {
        if (!window.confirm("删除到回收站？之后可以在这里恢复。")) return;
        void run("已移入回收站", () => movePersonnelToTrash(row.id));
      }}>
      删除到回收站
    </AdminButton>
  );
}

/** 把另一个人员并入本档案：本档案存活、对方被删除。不可逆，仅 SUPER_ADMIN。选中后二次确认再执行。 */
function MergePersonnelField({ row, onClose }: { row: UnifiedPersonnelRecord; onClose: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const search = async (kw: string) => {
    const { list } = await fetchUnifiedPersonnel(1, 20, { keyword: kw });
    return list.map((p) => ({
      key: String(p.id),
      label: p.name ?? "",
      subtitle: [p.departmentName, p.projectGroupName].filter(Boolean).join(" · "),
    }));
  };

  const onPick = async (opt: { key: string; label: string }) => {
    const targetId = Number(opt.key);
    if (!Number.isFinite(targetId) || targetId === row.id) return;
    if (!window.confirm(`把「${opt.label}」并入本档案「${row.name}」，「${opt.label}」的档案将被删除，此操作不可逆。确定继续？`)) return;
    try {
      await mergePersonnel(row.id, targetId);
      toast.success("已合并");
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "合并失败");
    }
  };

  return open ? (
    <SearchSelect
      search={search}
      onPick={onPick}
      excludeKeys={[String(row.id)]}
      placeholder="搜索要并入此档案的人员"
      emptyHint="没有匹配项"
    />
  ) : (
    <button type="button"
      className="inline-flex shrink-0 items-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--twin-body)] shadow-sm hover:bg-[var(--twin-canvas-soft)]"
      onClick={() => setOpen(true)}>并入此档案…</button>
  );
}

function PwdCell({ userId, onViewPassword }: { userId: string; onViewPassword: (userId: string) => Promise<string | null> }) {
  const [plain, setPlain] = React.useState<string | null | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const toggle = async () => {
    if (plain !== undefined) { setPlain(undefined); return; }
    setLoading(true);
    try { setPlain(await onViewPassword(userId)); } catch { setPlain(null); } finally { setLoading(false); }
  };
  return (
    <div className="inline-flex items-center gap-1 text-[11px]">
      <span className="font-mono text-[var(--twin-body)]">{plain === undefined ? "******" : plain ?? "（暂不可查看）"}</span>
      <button type="button" disabled={loading} onClick={toggle}
        className="rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1 text-[10px] text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] disabled:opacity-50">
        {loading ? "…" : plain === undefined ? "查看" : "隐藏"}
      </button>
    </div>
  );
}

/** 部门/课题组搜索选择：字典已在父级拉全量，这里内存过滤 */
function DictSelect({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: SearchOption[];
  onPick: (opt: SearchOption) => void;
}) {
  const [open, setOpen] = useState(false);

  const search = async (kw: string) => {
    const q = kw.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  };

  if (open) {
    return (
      <div className="py-0.5">
        <SearchSelect
          search={search}
          onPick={(opt) => { onPick(opt); setOpen(false); }}
          placeholder={`搜索${label}`}
          emptyHint="没有匹配项"
        />
      </div>
    );
  }
  return (
    <div className="flex justify-between gap-2 py-0.5 text-[11px]">
      <span className="text-[var(--twin-mute)]">{label}</span>
      <span
        className="cursor-pointer border-b border-dashed border-[var(--twin-hairline)] text-[var(--twin-body)] hover:border-[var(--twin-link)] hover:text-[var(--twin-link)]"
        onClick={() => setOpen(true)}
      >
        {value || "—"}
      </span>
    </div>
  );
}

/** 可点击编辑字段：点击进入输入，失焦/回车保存，空值不提交 */
function EditableText({
  label,
  value,
  onSave,
  emphasize = false,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  emphasize?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const valueCls = emphasize
    ? "cursor-pointer border-b border-dashed border-[var(--twin-hairline)] text-lg font-bold text-[var(--twin-ink)] hover:border-[var(--twin-link)] hover:text-[var(--twin-link)]"
    : "cursor-pointer border-b border-dashed border-[var(--twin-hairline)] text-[var(--twin-body)] hover:border-[var(--twin-link)] hover:text-[var(--twin-link)]";
  if (editing) {
    return (
      <div className={`flex justify-between gap-2 py-0.5 ${emphasize ? "text-lg" : "text-[11px]"}`}>
        {!emphasize ? <span className="text-[var(--twin-mute)]">{label}</span> : null}
        <input autoFocus value={draft}
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { setEditing(false); const v = draft.trim(); if (v && v !== value) onSave(v); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
          className={`rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1 py-0.5 text-[var(--twin-body)] ${emphasize ? "max-w-[14rem] text-lg font-bold" : "max-w-[16rem] text-[11px]"}`} />
      </div>
    );
  }
  return (
    <div className={`flex justify-between gap-2 py-0.5 ${emphasize ? "" : "text-[11px]"}`}>
      {!emphasize ? <span className="text-[var(--twin-mute)]">{label}</span> : null}
      <span onClick={() => { setDraft(value); setEditing(true); }}
        className={valueCls} title="点击编辑姓名（不等于账号名）">
        {value || "—"}
      </span>
    </div>
  );
}

/** 房间授权：本地覆盖层编辑。展示有效房间，弹窗按区域→楼层分组勾选。 */
function RoomAuthorizationField({ personId, fallbackZh, fallbackOfficial }: {
  personId: number;
  fallbackZh: string | null;
  fallbackOfficial: number | null;
}) {
  const qc = useQueryClient();
  const [auth, setAuth] = useState<PersonnelRoomAuthorization | null>(null);
  const [catalog, setCatalog] = useState<RoomMappingRoomRow[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let on = true;
    fetchPersonnelRoomAuthorization(personId)
      .then((d) => { if (on) setAuth(d); })
      .catch(() => {});
    fetchRoomMappingRooms({ page: 1, pageSize: 500 })
      .then(({ list }) => { if (on) setCatalog(list); })
      .catch(() => {});
    return () => { on = false; };
  }, [personId]);

  const groups = useMemo(() => {
    const g: Record<string, Record<string, RoomMappingRoomRow[]>> = {};
    for (const r of catalog) {
      const region = r.regionName || "其他";
      const floor = r.floorName || "其他";
      if (!g[region]) g[region] = {};
      if (!g[region][floor]) g[region][floor] = [];
      g[region][floor].push(r);
    }
    return g;
  }, [catalog]);

  // 展示：优先后端 rooms（含名称），其次用目录补全 roomIds，未加载时回退旧文案
  const chips: string[] = (() => {
    if (auth) {
      if (auth.rooms?.length) return auth.rooms.map((r) => r.roomName || r.roomId);
      if (auth.roomIds?.length) {
        const byId = new Map(catalog.map((r) => [r.roomId, r]));
        return auth.roomIds.map((id) => byId.get(id)?.roomName || id);
      }
      return [];
    }
    return (fallbackZh || "").split(/[、，,;；]/).map((s) => s.trim()).filter(Boolean);
  })();

  const openPicker = () => {
    setSelected(new Set(auth?.roomIds ?? []));
    setOpen(true);
  };

  const toggle = (roomId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId); else next.add(roomId);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await updatePersonnelRoomAuthorization(personId, [...selected]);
      toast.success("房间授权已更新");
      setOpen(false);
      setAuth(await fetchPersonnelRoomAuthorization(personId));
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {chips.length === 0 ? (
        <span className="text-[var(--twin-body)]">{auth ? "无" : fallbackOfficial === 1 ? "有" : "无"}</span>
      ) : chips.map((r, i) => (
        <span key={i} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">{r}</span>
      ))}
      <button type="button" className="shrink-0 text-[11px] text-[var(--twin-link)] hover:underline" onClick={openPicker}>修改</button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-ink)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--twin-ink)]">房间授权</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {catalog.length === 0 ? (
              <div className="py-6 text-center text-xs text-[var(--twin-mute)]">房间目录加载中…</div>
            ) : Object.entries(groups).map(([region, floors]) => (
              <div key={region} className="mb-3">
                <div className="text-xs font-semibold text-[var(--twin-ink)]">{region}</div>
                {Object.entries(floors).map(([floor, rooms]) => (
                  <div key={floor} className="mt-1 pl-2">
                    <div className="text-[11px] text-[var(--twin-mute)]">{floor}</div>
                    <div className="mt-1 space-y-0.5">
                      {rooms.map((r) => (
                        <label key={r.roomId} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--twin-canvas-soft)]">
                          <input type="checkbox" checked={selected.has(r.roomId)} onChange={() => toggle(r.roomId)} className="h-3.5 w-3.5 accent-[var(--twin-ink)]" />
                          <span className="text-xs text-[var(--twin-body)]">{r.roomName || r.roomId}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <DialogFooter>
            <AdminButton type="button" tone="secondary" size="sm" onClick={() => setOpen(false)}>取消</AdminButton>
            <AdminButton type="button" tone="primary" size="sm" loading={saving} onClick={save}>保存</AdminButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
