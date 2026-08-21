import { useMemo, useState } from "react";
import type { JSX } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clearStudentViolation, deleteStudentViolation, listStudentViolations, type StudentViolationRow } from "@/api/domains/studentViolation.api";
import { clearCageStatusViolation, deleteCageStatusViolation, getCageStatusViolation, listCageStatusViolations, type CageStatusViolationRow, type MemberViolationRow } from "@/api/domains/cageStatusViolation.api";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import { GroupRow, type CageGroup } from "./CageGroupedViewRows";

import { appConfirm } from "@/lib/appDialog";
const MEMBER_COUNTS_KEY = ["cage-status-violations", "member-counts"] as const;

type CageGroupedViewProps = {
  keyword: string;
  onEdit: (row: StudentViolationRow) => void;
};

async function loadActiveMemberCounts(records: CageStatusViolationRow[]): Promise<Record<number, number>> {
  const counts: Record<number, number> = {};
  await Promise.all(
    records.map(async (r) => {
      try {
        const d = await getCageStatusViolation(r.id);
        counts[r.id] = (d.members ?? []).filter((m) => m.status === "ACTIVE").length;
      } catch {
        counts[r.id] = 0;
      }
    })
  );
  return counts;
}

export function CageGroupedView({ keyword, onEdit }: CageGroupedViewProps): JSX.Element {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<{ parentId: number; members: CageStatusViolationRow["members"] }[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [busyGroup, setBusyGroup] = useState<string | null>(null);

  const { data: cageRecords = [], isLoading } = useQuery({
    queryKey: ["cage-status-violations"],
    queryFn: () => listCageStatusViolations(),
    refetchInterval: 30_000,
  });
  const { data: studentRows = [] } = useQuery({
    queryKey: ["studentViolations"],
    queryFn: () => listStudentViolations({ limit: 400 }),
  });

  const recordIdsKey = useMemo(
    () =>
      cageRecords
        .map((r) => r.id)
        .slice()
        .sort((a, b) => a - b)
        .join(","),
    [cageRecords]
  );

  // 缓存成员数：切回「按笼架」时可立刻用缓存过滤，避免先闪出无活跃成员的幽灵分组。
  const { data: memberCounts = {}, isFetched: countsFetched } = useQuery({
    queryKey: [...MEMBER_COUNTS_KEY, recordIdsKey],
    queryFn: () => loadActiveMemberCounts(cageRecords),
    enabled: !isLoading && cageRecords.length > 0,
    staleTime: 30_000,
  });
  const countsReady = cageRecords.length === 0 || countsFetched;

  const groups = useMemo(() => {
    if (!countsReady) return [];
    const map = new Map<string, { groupName: string; parents: CageStatusViolationRow[] }>();
    for (const rec of cageRecords) {
      const key = rec.projectGroupName?.trim() || "未命名课题组";
      if (!map.has(key)) map.set(key, { groupName: key, parents: [] });
      map.get(key)!.parents.push(rec);
    }
    let list = Array.from(map.values()).filter((grp) =>
      grp.parents.some((p) => (memberCounts[p.id] ?? 0) > 0)
    );
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter(
        (grp) =>
          grp.groupName.toLowerCase().includes(kw) ||
          grp.parents.some(
            (p) =>
              (p.positionLabel ?? "").toLowerCase().includes(kw) ||
              (p.campusName ?? "").toLowerCase().includes(kw) ||
              (p.roomName ?? "").toLowerCase().includes(kw)
          )
      );
    }
    return list;
  }, [cageRecords, memberCounts, countsReady, keyword]);

  /** 有父记录时须等成员数就绪，否则会短暂展示随后被过滤掉的「不存在」分组。 */
  const listPending = isLoading || !countsReady;

  const patchMemberCounts = (updater: (prev: Record<number, number>) => Record<number, number>) => {
    qc.setQueryData<Record<number, number>>([...MEMBER_COUNTS_KEY, recordIdsKey], (prev) => updater(prev ?? {}));
  };
  const toggleGroup = async (groupName: string) => {
    if (expanded === groupName) {
      setExpanded(null);
      setGroupMembers([]);
      return;
    }
    setExpanded(groupName);
    setGroupLoading(true);
    try {
      const parents = groups.find((g) => g.groupName === groupName)?.parents ?? [];
      const results = await Promise.all(
        parents.map(async (p) => {
          const detail = await getCageStatusViolation(p.id);
          return { parentId: p.id, members: detail.members ?? [] };
        })
      );
      setGroupMembers(results);
    } catch {
      toast.error("加载成员详情失败");
    } finally {
      setGroupLoading(false);
    }
  };

  const handleClearGroup = async (group: CageGroup) => {
    const activeParents = group.parents.filter((p) => p.status === "ACTIVE");
    if (!await appConfirm(`确定解除「${group.groupName}」下全部 ${activeParents.length} 条生效中的违规记录？`)) return;
    setBusyGroup(group.groupName);
    try {
      for (const p of activeParents) {
        try { await clearCageStatusViolation(p.id); } catch {}
      }
      patchMemberCounts((prev) => {
        const n = { ...prev };
        for (const p of activeParents) n[p.id] = 0;
        return n;
      });
      toast.success("已全部解除");
      qc.invalidateQueries({ queryKey: ["cage-status-violations"] });
      qc.invalidateQueries({ queryKey: ["studentViolations"] });
    } finally { setBusyGroup(null); }
  };

  const handleDeleteGroup = async (group: CageGroup) => {
    if (!await appConfirm(`确定删除「${group.groupName}」下全部 ${group.parents.length} 条记录？不可恢复。`)) return;
    setBusyGroup(group.groupName);
    try {
      for (const p of group.parents) {
        try { await deleteCageStatusViolation(p.id); } catch {}
      }
      patchMemberCounts((prev) => {
        const n = { ...prev };
        for (const p of group.parents) n[p.id] = 0;
        return n;
      });
      toast.success("已全部删除");
      qc.invalidateQueries({ queryKey: ["cage-status-violations"] });
      qc.invalidateQueries({ queryKey: ["studentViolations"] });
    } finally { setBusyGroup(null); }
  };

  const handleEditMember = (m: MemberViolationRow) => {
    const match = studentRows.find((r) => r.id === m.violationId);
    if (match) onEdit(match);
    else toast.error("未在列表中找到此记录，请刷新后重试");
  };

  const afterMemberMutation = (parentId: number) => {
    patchMemberCounts((prev) => {
      const n = { ...prev };
      if (n[parentId] > 0) n[parentId]--;
      return n;
    });
    qc.invalidateQueries({ queryKey: ["cage-status-violations"] });
    void toggleGroup(expanded!);
  };

  const handleClearMember = async (m: MemberViolationRow, parentId: number) => {
    if (await appConfirm("确定解除此违规？")) {
      clearStudentViolation(m.violationId)
        .then(() => { toast.success("已解除"); afterMemberMutation(parentId); })
        .catch((e) => toast.error(e?.message || "解除失败"));
    }
  };

  const handleDeleteMember = async (m: MemberViolationRow, parentId: number) => {
    if (await appConfirm("确定删除此记录？不可恢复。")) {
      deleteStudentViolation(m.violationId)
        .then(() => { toast.success("已删除"); afterMemberMutation(parentId); })
        .catch((e) => toast.error(e?.message || "删除失败"));
    }
  };

  return (
    <AdminTableShell loading={listPending} empty={!listPending && groups.length === 0} emptyMessage="暂无笼架违规记录" scrollable>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-tertiary)]">
            <th className="px-3 py-2">课题组</th>
            <th className="px-3 py-2">笼位/状态</th>
            <th className="px-3 py-2">校区</th>
            <th className="px-3 py-2">成员</th>
            <th className="px-3 py-2">最近触发</th>
            <th className="whitespace-nowrap px-3 py-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((grp) => (
            <GroupRow
              key={grp.groupName}
              group={grp}
              isExpanded={expanded === grp.groupName}
              memberCounts={memberCounts}
              busy={busyGroup != null}
              detailBusy={busyGroup === expanded}
              detailMembers={groupMembers}
              detailLoading={groupLoading}
              cageRecords={cageRecords}
              onToggle={() => void toggleGroup(grp.groupName)}
              onClearGroup={() => void handleClearGroup(grp)}
              onDeleteGroup={() => void handleDeleteGroup(grp)}
              onEditMember={handleEditMember}
              onClearMember={handleClearMember}
              onDeleteMember={handleDeleteMember}
            />
          ))}
        </tbody>
      </table>
    </AdminTableShell>
  );
}
