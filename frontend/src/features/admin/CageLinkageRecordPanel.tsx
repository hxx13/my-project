import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { X, UserPlus, Search, Trash2, Ban, Users } from "lucide-react";
import {
  getCageStatusViolation,
  clearCageStatusViolation,
  deleteCageStatusViolation,
  addCageViolationMember,
  removeCageViolationMember,
  batchClearCageViolationMembers,
  batchDeleteCageViolationMembers,
  type CageStatusViolationRow,
  type MemberViolationRow,
} from "@/api/domains/cageStatusViolation.api";
import { searchPersonnel } from "@/api/twinApi";
import { AdminButton, adminPickableRowClass } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminTableShell } from "@/components/admin/AdminPageShell";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "生效中", cls: "text-rose-700 bg-rose-50 border-rose-200" },
  CLEARED: { label: "已解除", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  EXPIRED: { label: "已过期", cls: "text-[var(--app-color-text-tertiary)] bg-neutral-50 border-neutral-200" },
};

interface Props {
  parentId: number;
  onClose: () => void;
}

export function CageLinkageRecordPanel({ parentId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  // Add member modal state
  const [showAddMember, setShowAddMember] = useState(false);
  const [addPersonKeyword, setAddPersonKeyword] = useState("");
  const [addPersonResults, setAddPersonResults] = useState<Array<Record<string, unknown>>>([]);
  const addPersonTimer = useRef<number | null>(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["cage-status-violation", parentId],
    queryFn: () => getCageStatusViolation(parentId),
    enabled: parentId > 0,
  });

  const clearAllMu = useMutation({
    mutationFn: () => clearCageStatusViolation(parentId),
    onSuccess: () => {
      toast.success("已解除此笼架违规");
      queryClient.invalidateQueries({ queryKey: ["cage-status-violations"] });
      queryClient.invalidateQueries({ queryKey: ["cage-status-violation", parentId] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e.message || "解除失败"),
  });

  const deleteAllMu = useMutation({
    mutationFn: () => deleteCageStatusViolation(parentId),
    onSuccess: () => {
      toast.success("已删除此记录");
      queryClient.invalidateQueries({ queryKey: ["cage-status-violations"] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e.message || "删除失败"),
  });

  const removeMemberMu = useMutation({
    mutationFn: (userId: string) => removeCageViolationMember(parentId, userId),
    onSuccess: () => {
      toast.success("已移除成员");
      queryClient.invalidateQueries({ queryKey: ["cage-status-violation", parentId] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e.message || "移除失败"),
  });

  const addMemberMu = useMutation({
    mutationFn: (userId: string) => addCageViolationMember(parentId, userId),
    onSuccess: () => {
      toast.success("已添加成员");
      queryClient.invalidateQueries({ queryKey: ["cage-status-violation", parentId] });
      setShowAddMember(false);
      setAddPersonKeyword("");
      setAddPersonResults([]);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e.message || "添加失败"),
  });

  const batchClearMu = useMutation({
    mutationFn: (ids: number[]) => batchClearCageViolationMembers(parentId, ids),
    onSuccess: (data) => {
      toast.success(`已解除 ${data?.cleared ?? 0} 条`);
      queryClient.invalidateQueries({ queryKey: ["cage-status-violation", parentId] });
      queryClient.invalidateQueries({ queryKey: ["cage-status-violations"] });
      setSelectedMemberIds(new Set());
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message || "批量解除失败"),
  });

  const batchDeleteMu = useMutation({
    mutationFn: (ids: number[]) => batchDeleteCageViolationMembers(parentId, ids),
    onSuccess: (data) => {
      toast.success(`已删除 ${data?.deleted ?? 0} 条`);
      queryClient.invalidateQueries({ queryKey: ["cage-status-violation", parentId] });
      queryClient.invalidateQueries({ queryKey: ["cage-status-violations"] });
      setSelectedMemberIds(new Set());
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message || "批量删除失败"),
  });

  const members = detail?.members ?? [];
  const filteredMembers = members.filter((m) => {
    const keyword = memberSearch.trim().toLowerCase();
    if (keyword) {
      const name = (m.displayName ?? "").toLowerCase();
      const uid = (m.userId ?? "").toLowerCase();
      if (!name.includes(keyword) && !uid.includes(keyword)) return false;
    }
    if (onlyActive && m.status !== "ACTIVE") return false;
    return true;
  });

  const toggleSelectMember = (violationId: number) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(violationId)) next.delete(violationId);
      else next.add(violationId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allIds = filteredMembers.map((m) => m.violationId);
    if (allIds.every((id) => selectedMemberIds.has(id))) {
      setSelectedMemberIds(new Set());
    } else {
      setSelectedMemberIds(new Set(allIds));
    }
  };

  const handleSearchPersonnel = useCallback(async (keyword: string) => {
    const q = keyword.trim();
    if (!q) {
      setAddPersonResults([]);
      return;
    }
    try {
      const { data: list } = await searchPersonnel(q);
      setAddPersonResults(Array.isArray(list) ? list : []);
    } catch {
      setAddPersonResults([]);
    }
  }, []);

  const statusBadge = (status: string) => {
    const b = STATUS_BADGE[status] ?? { label: status, cls: "text-neutral-500 bg-neutral-50 border-neutral-200" };
    return (
      <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${b.cls}`}>
        {b.label}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 border-t border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)]">
        <p className="text-sm text-[var(--app-color-text-tertiary)]">加载详情中…</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-4 border-t border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)]">
        <p className="text-sm text-[var(--app-color-text-tertiary)]">未找到记录</p>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--app-color-border-default)]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-bold text-[var(--app-color-text-primary)]">
              {detail.ruleName ?? "规则 #" + detail.ruleId}
            </h4>
            {statusBadge(detail.status)}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--app-color-text-secondary)]">
            <span>笼位: {detail.positionLabel}</span>
            <span>园区: {detail.campusName ?? "-"}</span>
            <span>房间: {detail.roomName ?? "-"}</span>
            <span>课题组: {detail.projectGroupName ?? "-"}</span>
            <span>PI: {detail.projectPiName ?? "-"}</span>
            <span>触发时间: {detail.triggeredAt?.slice(0, 16) ?? "-"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {detail.status === "ACTIVE" && (
            <AdminButton
              tone="secondary"
              size="sm"
              onClick={() => {
                if (confirm("确定解除此笼架违规？所有子记录也将被解除。")) {
                  clearAllMu.mutate();
                }
              }}
              disabled={clearAllMu.isPending}
            >
              <Ban className="w-3.5 h-3.5 mr-1" />
              全部解除
            </AdminButton>
          )}
          <AdminButton
            tone="destructive"
            size="sm"
            onClick={() => {
              if (confirm("确定物理删除此记录及所有子记录？不可恢复。")) {
                deleteAllMu.mutate();
              }
            }}
            disabled={deleteAllMu.isPending}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            全部删除
          </AdminButton>
        </div>
      </div>

      {/* Member sub-table */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h5 className="text-xs font-bold text-[var(--app-color-text-primary)]">
              成员子记录 ({filteredMembers.length}/{members.length})
            </h5>
            {selectedMemberIds.size > 0 && (
              <>
                <span className="text-[11px] text-[var(--app-color-accent)]">
                  已选 {selectedMemberIds.size}
                </span>
                <AdminButton size="sm" tone="secondary"
                  onClick={() => { if (confirm(`确定批量解除选中的 ${selectedMemberIds.size} 条子记录？`)) batchClearMu.mutate(Array.from(selectedMemberIds)); }}
                  disabled={batchClearMu.isPending}>
                  <Ban className="w-3 h-3 mr-0.5" />批量解除
                </AdminButton>
                <AdminButton size="sm" tone="destructive"
                  onClick={() => { if (confirm(`确定批量删除选中的 ${selectedMemberIds.size} 条子记录？不可恢复。`)) batchDeleteMu.mutate(Array.from(selectedMemberIds)); }}
                  disabled={batchDeleteMu.isPending}>
                  <Trash2 className="w-3 h-3 mr-0.5" />批量删除
                </AdminButton>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--app-color-text-tertiary)]" />
              <input
                className="w-40 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] pl-7 pr-2 py-1.5 text-xs text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]"
                placeholder="搜索姓名/工号…"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--app-color-text-secondary)] cursor-pointer">
              <AdminSwitchScaled
                size="sm"
                checked={onlyActive}
                onChange={setOnlyActive}
              />
              仅看生效中
            </div>
            <AdminButton size="sm" onClick={() => setShowAddMember(true)}>
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              添加成员
            </AdminButton>
          </div>
        </div>

        <AdminTableShell
          loading={false}
          empty={filteredMembers.length === 0}
          emptyMessage="暂无匹配的成员记录"
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-tertiary)]">
                <th className="py-1.5 px-2 w-8">
                  <input
                    type="checkbox"
                    checked={filteredMembers.length > 0 && filteredMembers.every((m) => selectedMemberIds.has(m.violationId))}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="py-1.5 px-2">姓名</th>
                <th className="py-1.5 px-2">工号</th>
                <th className="py-1.5 px-2">部门</th>
                <th className="py-1.5 px-2">状态</th>
                <th className="py-1.5 px-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((m) => (
                <tr
                  key={m.violationId}
                  className="border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]"
                >
                  <td className="py-1.5 px-2">
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.has(m.violationId)}
                      onChange={() => toggleSelectMember(m.violationId)}
                    />
                  </td>
                  <td className="py-1.5 px-2 font-medium text-[var(--app-color-text-primary)]">
                    {m.displayName ?? m.userId}
                  </td>
                  <td className="py-1.5 px-2 font-mono text-xs text-[var(--app-color-text-secondary)]">
                    {m.userId}
                  </td>
                  <td className="py-1.5 px-2 text-xs text-[var(--app-color-text-secondary)]">
                    {m.departmentName ?? "-"}
                  </td>
                  <td className="py-1.5 px-2">{statusBadge(m.status)}</td>
                  <td className="py-1.5 px-2 text-right space-x-1">
                    {m.status === "ACTIVE" && (
                      <button
                        type="button"
                        className="text-[11px] font-medium text-emerald-600 hover:text-emerald-800"
                        onClick={() => {
                          if (confirm("确定解除该成员的此条违规？")) {
                            removeMemberMu.mutate(m.userId);
                          }
                        }}
                      >
                        解除
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-[11px] font-medium text-red-500 hover:text-red-700"
                      onClick={() => {
                        if (confirm(`确定移除成员 ${m.displayName ?? m.userId}？`)) {
                          removeMemberMu.mutate(m.userId);
                        }
                      }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableShell>
      </div>

      {/* Add member modal */}
      {showAddMember && (
        <AddMemberModal
          keyword={addPersonKeyword}
          results={addPersonResults}
          loading={addMemberMu.isPending}
          onKeywordChange={(val) => {
            setAddPersonKeyword(val);
            if (addPersonTimer.current) window.clearTimeout(addPersonTimer.current);
            addPersonTimer.current = window.setTimeout(() => {
              void handleSearchPersonnel(val);
            }, 250);
          }}
          onSelect={(userId) => addMemberMu.mutate(userId)}
          onClose={() => {
            setShowAddMember(false);
            setAddPersonKeyword("");
            setAddPersonResults([]);
          }}
        />
      )}
    </div>
  );
}

/** Inline modal for searching and adding a member */
function AddMemberModal({
  keyword,
  results,
  loading,
  onKeywordChange,
  onSelect,
  onClose,
}: {
  keyword: string;
  results: Array<Record<string, unknown>>;
  loading: boolean;
  onKeywordChange: (val: string) => void;
  onSelect: (userId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-[var(--app-elevation-modal)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-[var(--app-color-text-primary)]">添加违规成员</h4>
          <button type="button" onClick={onClose} className="text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          className="w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]"
          placeholder="搜索姓名或工号…"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          autoFocus
          disabled={loading}
        />
        {results.length > 0 && (
          <div className="mt-2 max-h-[240px] overflow-y-auto app-themed-scrollbar rounded-md border border-[var(--app-color-border-default)]">
            {results.map((rawPerson) => {
              const rp = rawPerson as Record<string, unknown>;
              const safeId = String(rp.user_id ?? rp.userid ?? rp.userId ?? rp.id ?? "").trim();
              const safeName = String(rp.name ?? rp.username ?? "未知").trim() || safeId;
              return (
                <button
                  key={safeId}
                  type="button"
                  className="block w-full text-left px-3 py-2 text-sm text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)] transition-colors border-b border-[var(--app-color-border-default)] last:border-b-0"
                  onClick={() => onSelect(safeId)}
                  disabled={loading}
                >
                  <span className="font-medium">{safeName}</span>
                  <span className="ml-2 font-mono text-xs text-[var(--app-color-text-tertiary)]">{safeId}</span>
                </button>
              );
            })}
          </div>
        )}
        {keyword.trim() && results.length === 0 && !loading && (
          <p className="mt-2 text-xs text-[var(--app-color-text-tertiary)]">未搜索到匹配的人员</p>
        )}
      </div>
    </div>
  );
}
