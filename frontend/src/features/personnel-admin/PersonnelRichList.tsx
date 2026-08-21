import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { usePrefersReducedMotion } from "@/hooks/useTypewriterText";
import { AdminButton } from "@/components/admin/AdminButton";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";
import type { UnifiedPersonnelRecord } from "@/api/domains/admin.api";
import type { IdentityTag } from "@/api/domains/personIdentity.api";
import { cn } from "@/lib/utils";
import "./personnelAdmin.css";

export const ROLE_LABEL_MAP: Record<string, string> = {
  MEMBER: "学生",
  STAFF: "普通员工",
  SENIOR: "高级员工",
  ADMIN: "管理员",
  SUPER_ADMIN: "超级管理员",
  PLATFORM_OWNER: "平台所有者",
};

export function SysBadge({ hasAccount }: { hasAccount: boolean }) {
  return (
    <span className={cn(
      "rounded-full px-2 py-0.5 text-[10px] font-medium",
      hasAccount ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"
    )}>
      {hasAccount ? "有系统账号" : "无系统账号"}
    </span>
  );
}

export function StatusPill({ hasAccount, status }: { hasAccount: boolean; status?: number | null }) {
  if (!hasAccount) return null; // 状态只对账号人显示
  return (
    <span className={cn(
      "rounded-full px-2 py-0.5 text-[10px] font-medium",
      status === 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"
    )}>
      {status === 0 ? "已禁用" : "启用中"}
    </span>
  );
}

export function Avatar({ name, head, size = "md" }: { name?: string | null; head?: string | null; size?: "md" | "lg" }) {
  const initial = (name || "?").charAt(0);
  const avatarSrc = resolvePersonnelAvatarUrl(head);
  return (
    <span className={cn(
      "relative shrink-0 overflow-hidden rounded-full border-2 border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]",
      size === "lg" ? "h-16 w-16" : "h-8 w-8"
    )}>
      <span className={cn("absolute inset-0 flex items-center justify-center font-black text-[var(--twin-ink)]", size === "lg" ? "text-2xl" : "text-xs")}>{initial}</span>
      {avatarSrc ? <img src={avatarSrc} alt={name || ""} referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
    </span>
  );
}

interface Props {
  rows: UnifiedPersonnelRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  selectedId: number | null;
  onSelect: (row: UnifiedPersonnelRecord) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  identityMap: Map<string, IdentityTag[]>;
  onQuickResetPassword: (row: UnifiedPersonnelRecord) => void;
  isLoading: boolean;
}

export function PersonnelRichList({
  rows, total, page, pageSize, totalPages, selectedId, onSelect,
  onPageChange, onPageSizeChange, identityMap, onQuickResetPassword, isLoading,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useGSAP(() => {
    if (!listRef.current || reducedMotion) return;
    const items = Array.from(listRef.current.children);
    if (items.length === 0) return;
    gsap.fromTo(items,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.35, stagger: 0.04, ease: "power2.out", overwrite: true }
    );
  }, { scope: listRef, dependencies: [rows, page] });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm">
      <div className="personnel-list min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--twin-mute)]">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[160px] items-center justify-center text-sm text-[var(--twin-mute)]">暂无人员（可先「同步人员」）</div>
        ) : (
          <div ref={listRef}>
            {rows.map((row) => {
              const hasAccount = Boolean(row.staffId);
              const tags = identityMap.get(String(row.id)) ?? [];
              const rooms = (row.allowedRoomsDisplayZh || "").split(/[、，,;；]/).map((s) => s.trim()).filter(Boolean);
              return (
                <div
                  key={row.id}
                  className={cn("personnel-row border-b border-[var(--twin-hairline)]", selectedId === row.id && "is-selected")}
                  onClick={() => onSelect(row)}
                >
                  <Avatar name={row.name} head={row.head} />
                  <div className="personnel-row-main">
                    <div className="personnel-row-title">
                      <span className="text-[var(--twin-ink)]">{row.name || "—"}</span>
                      <SysBadge hasAccount={hasAccount} />
                      <StatusPill hasAccount={hasAccount} status={row.status} />
                      <span className="personnel-extra rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                        {ROLE_LABEL_MAP[row.role ?? "MEMBER"] ?? row.role ?? "—"}
                      </span>
                      {tags.map((t) => (
                        <span key={t.id} className="personnel-extra rounded-full bg-pink-50 px-2 py-0.5 text-[10px] font-medium text-pink-700">{t.label}</span>
                      ))}
                    </div>
                    <div className="personnel-row-sub">
                      {[row.departmentName, row.projectGroupName].filter(Boolean).join(" · ") || "—"}
                      {rooms.length ? <span className="ml-1 text-indigo-500">· {rooms.slice(0, 2).join("/")}{rooms.length > 2 ? "…" : ""}</span> : null}
                    </div>
                  </div>
                  <AdminButton type="button" tone="ghost" size="sm"
                    onClick={(e) => { e.stopPropagation(); onQuickResetPassword(row); }}>
                    重置
                  </AdminButton>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* 分页 */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--app-color-border-default)] px-3 py-2">
        <span className="text-xs text-[var(--twin-mute)]">共 {total} 条</span>
        <div className="flex items-center gap-2">
          <select value={pageSize}
            onChange={(e) => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
            className="rounded border border-[var(--app-color-border-default)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] bg-[var(--app-color-surface-container)]">
            {[10, 20, 30, 50].map((s) => (<option key={s} value={s}>{s}/页</option>))}
          </select>
          <AdminButton type="button" tone="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</AdminButton>
          <span className="text-xs text-[var(--twin-mute)]">{page} / {totalPages}</span>
          <AdminButton type="button" tone="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>下一页</AdminButton>
        </div>
      </div>
    </div>
  );
}
