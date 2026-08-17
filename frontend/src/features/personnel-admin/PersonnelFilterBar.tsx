import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AdminButton } from "@/components/admin/AdminButton";
import type { UnifiedPersonnelFilter } from "@/api/domains/admin.api";
import type { DepartmentDict, ProjectGroupDict } from "@/api/domains/admin.api";
import type { IdentityTag } from "@/api/domains/personIdentity.api";
import { cn } from "@/lib/utils";

export interface FilterBarOptions {
  departments: DepartmentDict[];
  groups: ProjectGroupDict[];
  identityTags: IdentityTag[];
  rooms: string[];
}

const ROLE_OPTIONS = [
  { value: "MEMBER", label: "学生" },
  { value: "STAFF", label: "普通员工" },
  { value: "SENIOR", label: "高级员工" },
  { value: "ADMIN", label: "管理员" },
  { value: "SUPER_ADMIN", label: "超级管理员" },
];

interface Props {
  value: UnifiedPersonnelFilter;
  onChange: (next: UnifiedPersonnelFilter) => void;
  onApply: () => void;
  onReset: () => void;
  options: FilterBarOptions;
  total: number;
}

export function PersonnelFilterBar({ value, onChange, onApply, onReset, options, total }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const set = (patch: Partial<UnifiedPersonnelFilter>) => onChange({ ...value, ...patch });
  const selectCls =
    "h-8 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 text-xs text-[var(--app-color-text-primary)] focus:outline-none";

  return (
    <div className="space-y-3">
      {/* 自动分区 Tab */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[var(--twin-canvas-soft-2)] p-0.5">
        {(["all", "sys", "nosys"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { set({ accountType: t }); onApply(); }}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              (value.accountType ?? "all") === t
                ? "bg-[var(--twin-canvas)] text-[var(--twin-ink)] shadow-sm"
                : "text-[var(--twin-mute)] hover:text-[var(--twin-body)]"
            )}
          >
            {t === "all" ? `全部 ${total}` : t === "sys" ? "有系统账号" : "无系统账号"}
          </button>
        ))}
      </div>

      {/* 关键词 + 主筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={value.keyword ?? ""}
          onChange={(e) => set({ keyword: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") onApply(); }}
          placeholder="姓名 / 工号 / 账号 / 手机号 / 邮箱"
          className="min-w-0 flex-1 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-1.5 text-xs text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:outline-none"
        />
        <select className={selectCls} value={value.groupId ?? ""}
          onChange={(e) => set({ groupId: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">课题组：全部</option>
          {options.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select className={selectCls} value={value.departmentId ?? ""}
          onChange={(e) => set({ departmentId: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">部门：全部</option>
          {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className={selectCls} value={value.identityTagId ?? ""}
          onChange={(e) => set({ identityTagId: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">身份标识：全部</option>
          {options.identityTags.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select className={selectCls} value={value.roomName ?? ""}
          onChange={(e) => set({ roomName: e.target.value || undefined })}>
          <option value="">房间：全部</option>
          {options.rooms.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <AdminButton type="button" tone="primary" size="sm" onClick={onApply}>筛选</AdminButton>
        <AdminButton type="button" tone="ghost" size="sm" onClick={() => {
          onChange({ accountType: value.accountType ?? "all" });
          onReset();
        }}>重置</AdminButton>
        <button type="button" onClick={() => setMoreOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)]">
          更多筛选 <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", moreOpen && "rotate-180")} />
        </button>
      </div>

      {/* 更多筛选 */}
      {moreOpen ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2">
          <span className="text-xs text-[var(--twin-mute)]">角色</span>
          <select className={selectCls} value={value.role ?? ""}
            onChange={(e) => set({ role: e.target.value || undefined })}>
            <option value="">全部</option>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <span className="text-xs text-[var(--twin-mute)]">账号状态</span>
          <select className={selectCls} value={value.status ?? ""}
            onChange={(e) => set({ status: e.target.value === "" ? undefined : Number(e.target.value) })}>
            <option value="">全部</option>
            <option value="1">启用</option>
            <option value="0">禁用</option>
          </select>
          <span className="text-xs text-[var(--twin-mute)]">校内/校外</span>
          <select className={selectCls} value={value.isSchool ?? ""}
            onChange={(e) => set({ isSchool: e.target.value === "" ? undefined : Number(e.target.value) })}>
            <option value="">全部</option>
            <option value="1">校内</option>
            <option value="0">校外</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}
