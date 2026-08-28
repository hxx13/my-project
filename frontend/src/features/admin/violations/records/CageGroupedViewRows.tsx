import type { JSX } from "react";
import { Ban, Pencil, Trash2 } from "lucide-react";
import type { CageStatusViolationRow, MemberViolationRow } from "@/api/domains/cageStatusViolation.api";
import { AdminButton } from "@/components/admin/AdminButton";

const STATUS_LABEL_MAP: Record<string, string> = {
  COHABITATION: "合笼/繁殖",
  SPECIAL_FEEDING: "特殊饲养",
  NEED_DIVIDE: "请分笼/密度超标",
  HEALTH_ABNORMAL: "动物健康异常",
  ANIMAL_TRANSFER: "动物转移",
};

export type CageGroup = {
  groupName: string;
  parents: CageStatusViolationRow[];
};

type GroupRowProps = {
  group: CageGroup;
  isExpanded: boolean;
  busy: boolean;
  detailBusy: boolean;
  detailMembers: { parentId: number; members: CageStatusViolationRow["members"] }[];
  detailLoading: boolean;
  cageRecords: CageStatusViolationRow[];
  onToggle: () => void;
  onClearGroup: () => void;
  onDeleteGroup: () => void;
  onEditMember: (member: MemberViolationRow) => void;
  onClearMember: (member: MemberViolationRow, parentId: number) => void;
  onDeleteMember: (member: MemberViolationRow, parentId: number) => void;
};

export function GroupRow({ group, isExpanded, busy, detailBusy, detailMembers, detailLoading, cageRecords, onToggle, onClearGroup, onDeleteGroup, onEditMember, onClearMember, onDeleteMember }: GroupRowProps): JSX.Element {
  const activeParents = group.parents.filter((p) => p.status === "ACTIVE");
  const latestTime = group.parents.reduce((max, p) => {
    const t = p.triggeredAt ?? "";
    return t > max ? t : max;
  }, "");
  return (
    <>
      <tr className={`border-b border-[var(--app-color-border-default)] ${isExpanded ? "bg-[var(--app-color-surface-hover)]" : "hover:bg-[var(--app-color-surface-hover)]"}`}>
        <td className="px-3 py-2">
          <span className="font-semibold text-[var(--app-color-text-primary)]">{group.groupName}</span>
          {(() => {
            const count = group.parents.reduce((s, p) => s + (p.memberCount ?? 0), 0);
            return count > 0 ? (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-[var(--app-color-feedback-danger-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-color-feedback-danger)]">
                {count} 人
              </span>
            ) : null;
          })()}
        </td>
        <td className="px-3 py-2 text-xs text-[var(--app-color-text-secondary)]">
          {[...new Set(group.parents.map((p) => STATUS_LABEL_MAP[p.statusCode] ?? p.statusCode))].join("、")}
        </td>
        <td className="px-3 py-2 text-xs text-[var(--app-color-text-secondary)]">
          {(() => {
            const locs = [...new Set(group.parents.map((p) => [p.campusName, p.roomName].filter(Boolean).join("/")).filter(Boolean))];
            return locs.slice(0, 2).join("；") + (locs.length > 2 ? " …" : "") || "-";
          })()}
        </td>
        <td className="px-3 py-2 text-xs text-[var(--app-color-text-secondary)]">
          {(() => {
            const total = group.parents.reduce((s, p) => s + (p.memberCount ?? 0), 0);
            return total > 0 ? `${total} 人` : "...";
          })()}
        </td>
        <td className="px-3 py-2 text-xs text-[var(--app-color-text-tertiary)]">{latestTime ? latestTime.slice(0, 16) : "-"}</td>
        <td className="whitespace-nowrap px-3 py-2">
          <div className="flex items-center gap-1">
            <AdminButton size="sm" tone="secondary" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
              <Pencil className="mr-0.5 h-3.5 w-3.5" />
              {isExpanded ? "收起" : "编辑"}
            </AdminButton>
            {activeParents.length > 0 && (
              <AdminButton size="sm" tone="secondary" className="text-[var(--app-color-feedback-success)]" disabled={busy} onClick={(e) => { e.stopPropagation(); onClearGroup(); }}>
                <Ban className="mr-0.5 h-3 w-3" />
                解除
              </AdminButton>
            )}
            <AdminButton size="sm" tone="destructive" disabled={busy} onClick={(e) => { e.stopPropagation(); onDeleteGroup(); }}>
              <Trash2 className="mr-0.5 h-3 w-3" />
              删除
            </AdminButton>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr key={`${group.groupName}-detail`}>
          <td colSpan={6} className="border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-0">
            {detailLoading ? (
              <div className="px-4 py-4 text-xs text-[var(--app-color-text-tertiary)]">加载成员中…</div>
            ) : detailMembers.length === 0 ? (
              <div className="px-4 py-4 text-xs text-[var(--app-color-text-tertiary)]">暂无成员记录</div>
            ) : (
              <div className="p-4">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-tertiary)]">
                      <th className="px-2 py-1.5">姓名</th>
                      <th className="px-2 py-1.5">笼位</th>
                      <th className="px-2 py-1.5">状态类型</th>
                      <th className="px-2 py-1.5">违规状态</th>
                      <th className="px-2 py-1.5">创建时间</th>
                      <th className="px-2 py-1.5">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailMembers.flatMap(({ parentId, members: mems }) => {
                      const parent = cageRecords.find((r) => r.id === parentId);
                      return (mems ?? []).map((m) => (
                        <MemberRow
                          key={m.violationId}
                          member={m}
                          parent={parent}
                          busy={detailBusy}
                          onEdit={onEditMember}
                          onClear={(member) => onClearMember(member, parentId)}
                          onDelete={(member) => onDeleteMember(member, parentId)}
                        />
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

type MemberRowProps = {
  member: MemberViolationRow;
  parent: CageStatusViolationRow | undefined;
  busy: boolean;
  onEdit: (member: MemberViolationRow) => void;
  onClear: (member: MemberViolationRow) => void;
  onDelete: (member: MemberViolationRow) => void;
};

export function MemberRow({ member, parent, busy, onEdit, onClear, onDelete }: MemberRowProps): JSX.Element {
  const statusLabel = STATUS_LABEL_MAP[parent?.statusCode ?? ""] ?? parent?.statusCode ?? "-";
  return (
    <tr className="border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]">
      <td className="px-2 py-1.5 font-medium text-[var(--app-color-text-primary)]">{member.displayName ?? member.userId}</td>
      <td className="px-2 py-1.5 text-xs text-[var(--app-color-text-secondary)]">{parent?.positionLabel ?? "-"}</td>
      <td className="px-2 py-1.5 text-xs">{statusLabel}</td>
      <td className="px-2 py-1.5">
        <span className={member.status === "ACTIVE" ? "text-xs font-medium text-[var(--app-color-feedback-danger)]" : "text-xs text-[var(--app-color-feedback-success)]"}>
          {member.status === "ACTIVE" ? "生效中" : member.status === "CLEARED" ? "已解除" : member.status === "EXPIRED" ? "已过期" : member.status === "SUPERSEDED" ? "已覆盖" : member.status}
        </span>
      </td>
      <td className="px-2 py-1.5 text-xs text-[var(--app-color-text-tertiary)]">{member.createdAt?.slice(0, 16) ?? "-"}</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <AdminButton size="sm" tone="secondary" onClick={() => onEdit(member)}>
            <Pencil className="mr-0.5 h-3 w-3" />
            编辑
          </AdminButton>
          {member.status === "ACTIVE" && (
            <AdminButton size="sm" tone="secondary" className="text-[var(--app-color-feedback-success)]" disabled={busy} onClick={() => onClear(member)}>
              <Ban className="mr-0.5 h-3 w-3" />
              解除
            </AdminButton>
          )}
          <AdminButton size="sm" tone="destructive" disabled={busy} onClick={() => onDelete(member)}>
            <Trash2 className="mr-0.5 h-3 w-3" />
            删除
          </AdminButton>
        </div>
      </td>
    </tr>
  );
}
