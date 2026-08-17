import * as React from "react";
import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { usePrefersReducedMotion } from "@/hooks/useTypewriterText";
import { Briefcase, GraduationCap, Mail, Send, Smartphone, Building2, IdCard, ShieldCheck } from "lucide-react";
import type { UnifiedPersonnelRecord } from "@/api/domains/admin.api";
import type { IdentityTag } from "@/api/domains/personIdentity.api";
import { hasMinRole } from "@/features/auth/roleAccess";
import { Avatar, SysBadge, StatusPill, ROLE_LABEL_MAP } from "./PersonnelRichList";

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
  onSaveField: (field: "job_number" | "department_name" | "project_group_name" | "user_type_names", value: string) => void;
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
  const cardRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useGSAP(() => {
    if (!cardRef.current) return;
    if (reducedMotion) {
      gsap.set(cardRef.current, { xPercent: 0, opacity: 1 });
      return;
    }
    gsap.fromTo(cardRef.current,
      { xPercent: 100, opacity: 0 },
      { xPercent: 0, opacity: 1, duration: 0.45, ease: "power3.out" }
    );
  }, { scope: cardRef, dependencies: [row.id] });

  const uid = row.staffId || "";
  const isBuiltin = uid === BUILTIN_SUPER_ADMIN_ID;
  const isStaff = hasMinRole(row.role || "MEMBER", "STAFF");
  const hasAccount = Boolean(row.staffId);
  const tags = hasAccount ? (identityMap.get(row.staffId ?? "") ?? []) : [];

  const inkBtn =
    "inline-flex shrink-0 items-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--twin-body)] shadow-sm hover:bg-[var(--twin-canvas-soft)] disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div ref={cardRef} className="flex h-full min-h-0 min-w-[380px] max-w-[720px] flex-[0_0_50%] flex-col overflow-hidden rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-4">
      {/* 头部 */}
      <header className="flex items-start gap-4 border-b border-[var(--twin-hairline)] p-4">
        <Avatar name={row.name} head={row.head} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-[var(--twin-ink)]">{row.name || "—"}</h3>
            <SysBadge hasAccount={hasAccount} />
            <StatusPill hasAccount={hasAccount} status={row.status} />
          </div>
          <div className="mt-1 truncate text-xs text-[var(--twin-mute)]">
            {[row.userTypeNames, row.departmentName, row.projectGroupName].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <button type="button" onClick={onClose}
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
            <EditableText label="部门" value={row.departmentName || ""} onSave={(v) => onSaveField("department_name", v)} />
            <EditableText label="课题组" value={row.projectGroupName || ""} onSave={(v) => onSaveField("project_group_name", v)} />
            <div className="flex justify-between gap-2 py-0.5 text-[11px]"><span className="text-[var(--twin-mute)]">校内</span><span className="text-[var(--twin-body)]">{row.isSchool === 1 ? "是" : row.isSchool === 0 ? "否" : "—"}</span></div>
          </div>
          <div className="rounded-lg border border-[var(--twin-hairline)] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--twin-mute)]"><IdCard className="h-3.5 w-3.5" />身份与联系</div>
            <EditableText label="工号" value={row.jobNumber || ""} onSave={(v) => onSaveField("job_number", v)} />
            <EditableText label="类型" value={row.userTypeNames || ""} onSave={(v) => onSaveField("user_type_names", v)} />
            <div className="flex justify-between gap-2 py-0.5 text-[11px]"><span className="text-[var(--twin-mute)]">手机</span><span className="text-[var(--twin-body)]">{row.mobilePhone || "—"}</span></div>
            <div className="flex justify-between gap-2 py-0.5 text-[11px]">
              <span className="shrink-0 text-[var(--twin-mute)]">房间授权</span>
              <div className="flex flex-wrap justify-end gap-1">
                {(() => {
                  const rooms = (row.allowedRoomsDisplayZh || "").split(/[、，,;；]/).map((s) => s.trim()).filter(Boolean);
                  if (rooms.length === 0) return <span className="text-[var(--twin-body)]">{row.hasOfficialRoomPermission === 1 ? "有" : "无"}</span>;
                  return rooms.map((r, i) => (<span key={i} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">{r}</span>));
                })()}
              </div>
            </div>
          </div>
        </section>

        {/* 身份标识 */}
        {isSuperAdmin ? (
          <section className="rounded-lg border border-[var(--twin-hairline)] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--twin-mute)]"><ShieldCheck className="h-3.5 w-3.5" />身份标识</div>
            {hasAccount ? (
              <div className="mb-1.5 flex items-center gap-2">
                <span className="flex flex-wrap gap-1">
                  {tags.length === 0 ? (<span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">实验员（默认）</span>) : tags.map((t) => (<span key={t.id} className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-800">{t.label}</span>))}
                </span>
                <button type="button" className="text-[11px] text-[var(--twin-link)] hover:underline"
                  onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onOpenIdentityPicker(row.staffId!, { x: r.left, y: r.bottom + 4 }); }}>
                  设置
                </button>
              </div>
            ) : <div className="text-[11px] text-[var(--twin-mute)]">无系统账号，身份标识不可用</div>}
          </section>
        ) : null}

        {/* 操作栏 */}
        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
          <span className="text-[11px] text-[var(--twin-mute)]">角色</span>
          <select disabled={isBuiltin || !hasAccount} value={row.role || "MEMBER"}
            onChange={(e) => onRoleChange(uid, e.target.value)}
            className="h-7 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 text-[11px] text-[var(--twin-body)]">
            {ROLE_OPTIONS.map((r) => (<option key={r} value={r}>{ROLE_LABEL_MAP[r]}</option>))}
          </select>
          {hasAccount ? (
            <button type="button" disabled={isBuiltin} onClick={() => onToggleStatus(uid)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${row.status === 0 ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {row.status === 0 ? "已禁用" : "启用中"}
            </button>
          ) : <span className="text-[11px] text-[var(--twin-mute)]">无系统账号</span>}
          {isSuperAdmin && !isBuiltin && hasAccount ? (
            <>
              <button type="button" className={inkBtn} onClick={() => onResetOpenId(uid)}>重置绑定</button>
              {isStaff ? (
                <button type="button" className={`${inkBtn} border-rose-200 text-rose-700 hover:bg-rose-50`} onClick={() => onDelete(uid)}>删除</button>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </div>
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

/** 可点击编辑字段：点击进入输入，失焦/回车保存，空值不提交 */
function EditableText({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  if (editing) {
    return (
      <div className="flex justify-between gap-2 py-0.5 text-[11px]">
        <span className="text-[var(--twin-mute)]">{label}</span>
        <input autoFocus value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { setEditing(false); const v = draft.trim(); if (v && v !== value) onSave(v); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
          className="max-w-[16rem] rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1 py-0.5 text-[11px] text-[var(--twin-body)]" />
      </div>
    );
  }
  return (
    <div className="flex justify-between gap-2 py-0.5 text-[11px]">
      <span className="text-[var(--twin-mute)]">{label}</span>
      <span onClick={() => { setDraft(value); setEditing(true); }}
        className="cursor-pointer border-b border-dashed border-[var(--twin-hairline)] text-[var(--twin-body)] hover:border-[var(--twin-link)] hover:text-[var(--twin-link)]" title="点击编辑">
        {value || "—"}
      </span>
    </div>
  );
}
