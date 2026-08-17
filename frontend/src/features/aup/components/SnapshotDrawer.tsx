import { useMemo } from "react";
import { useAupSnapshots, useAupRollback } from "../hooks/useAup";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import type { AupSnapshotMeta } from "../schema/aup";

interface SnapshotDrawerProps {
  open: boolean;
  aupId?: string;
  onClose: () => void;
}

/**
 * 右侧快照抽屉（原型 `#snapDrawer`）。
 * 列出各阶段快照（按 versionNo 倒序，最高为「当前」），支持回退。
 */
export default function SnapshotDrawer({ open, aupId, onClose }: SnapshotDrawerProps) {
  const { data: snaps = [] } = useAupSnapshots(aupId);
  const rollback = useAupRollback(aupId);

  const sorted = useMemo(() => {
    return [...snaps].sort((a, b) => b.versionNo - a.versionNo);
  }, [snaps]);
  const maxVersion = sorted.length > 0 ? sorted[0].versionNo : -1;

  if (!open) return null;

  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-hd">
          <b>快照版本 · 可回退</b>
          <button className="btn ghost small" onClick={onClose}>✕ 关闭</button>
        </div>
        {sorted.length === 0 ? (
          <div className="aup-empty">暂无快照</div>
        ) : (
          sorted.map((s) => (
            <div key={s.snapshotId} className={"snap" + (s.versionNo === maxVersion ? " cur" : "")} style={{ marginBottom: 10 }}>
              <div className="sn">v{s.versionNo} · {stageLabel(s)}</div>
              <div className="m">{formatDateTimeAsiaShanghaiShort(s.createdAt)}{s.createdBy ? ` · ${s.createdBy}` : ""}</div>
              {s.versionNo === maxVersion ? (
                <span className="tag" style={{ background: "var(--primary-weak)", color: "var(--primary)", marginTop: 8 }}>当前</span>
              ) : (
                <button
                  className="btn ghost small"
                  disabled={rollback.isPending}
                  onClick={() => {
                    if (confirm(`确定回退到 v${s.versionNo}？当前草稿会被覆盖。`)) {
                      rollback.mutate(s.snapshotId, { onSuccess: onClose });
                    }
                  }}
                >
                  回退到此版本
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const STAGE_LABELS: Record<string, string> = {
  piReview: "组长审核",
  formatReview: "格式审查",
  expertReview: "专家审查",
  approved: "审核通过",
  terminated: "已终止",
  expired: "已过期",
};

/** 草稿阶段（stage=draft）按草稿来源显示准确名称 */
const DRAFT_SOURCE_LABELS: Record<string, string> = {
  first: "首次填写",
  piReturn: "组长退回修改",
  formatReturn: "格式退回修改",
  expertReturn: "专家退回修改",
  rollback: "回退",
};

function stageLabel(s: AupSnapshotMeta): string {
  if (s.stage === "draft") {
    return (s.draftSource && DRAFT_SOURCE_LABELS[s.draftSource]) || "填写草稿";
  }
  return STAGE_LABELS[s.stage] ?? s.stage;
}
