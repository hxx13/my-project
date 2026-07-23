export type AutoApproveCandidate = {
  key: string;
  subjectUserId: string;
  subjectDisplayName?: string;
  dimensionLabel: string;
  pendingCount?: number;
  approvedCount?: number;
  alreadyTrusted?: boolean;
};

type Props = {
  candidates: AutoApproveCandidate[];
  selectedKey?: string;
  loading?: boolean;
  emptyHint?: string;
  onSelect: (c: AutoApproveCandidate) => void;
};

export function AutoApproveCandidateSelect({
  candidates,
  selectedKey,
  loading,
  emptyHint = "暂无待审或历史记录，无法配置按人规则",
  onSelect,
}: Props) {
  if (loading) {
    return <p className="text-sm text-[var(--twin-mute)]">加载申请人…</p>;
  }
  if (!candidates.length) {
    return <p className="text-sm text-[var(--twin-mute)]">{emptyHint}</p>;
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-[var(--twin-ink)]">从已有记录选择申请人</label>
      <select
        className="w-full rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-sm"
        value={selectedKey ?? ""}
        onChange={(e) => {
          const c = candidates.find((x) => x.key === e.target.value);
          if (c) onSelect(c);
        }}
      >
        <option value="">请选择姓名（自动锁定 ID 与维度）</option>
        {candidates.map((c) => {
          const name = c.subjectDisplayName || c.subjectUserId;
          const stats: string[] = [];
          if (c.pendingCount) stats.push(`待审 ${c.pendingCount}`);
          if (c.approvedCount) stats.push(`已通过 ${c.approvedCount}`);
          const suffix = stats.length ? ` · ${stats.join(" / ")}` : "";
          const trusted = c.alreadyTrusted ? " · 已配置" : "";
          return (
            <option key={c.key} value={c.key}>
              {name} · {c.dimensionLabel}
              {suffix}
              {trusted}
            </option>
          );
        })}
      </select>
      {selectedKey ? (
        <p className="text-xs text-[var(--twin-mute)]">
          已锁定申请人，无需手动输入 ID；保存后新申请将按规则自动通过。
        </p>
      ) : null}
    </div>
  );
}
