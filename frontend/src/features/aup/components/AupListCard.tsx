import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { AupListItem, AupStage, DraftSource } from "../schema/aup";
import MiniStageIndicator from "./MiniStageIndicator";
import { useAupSnapshots } from "../hooks/useAup";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";

gsap.registerPlugin(useGSAP);

/** 一条操作按钮描述，卡片/列表共用 */
export type ItemAction = { key: string; label: string; primary?: boolean; danger?: boolean; onClick: () => void };

/** 阶段 → 状态徽标（列表视图用） */
export function stageBadge(item: AupListItem): { text: string; cls: string } {
  switch (item.currentStage) {
    case "approved":
      return { text: "已批准", cls: "approved" };
    case "terminated":
      return { text: "已终止", cls: "terminated" };
    case "expired":
      return { text: "已过期", cls: "terminated" };
    case "draft":
      switch (item.draftSource) {
        case "piReturn":
          return { text: "退回给实验员", cls: "modify" };
        case "formatReturn":
          return { text: "返修(第1轮)", cls: "modify" };
        case "expertReturn":
          return { text: "返修(第2轮)", cls: "modify" };
        case "rollback":
          return { text: "已回退", cls: "modify" };
        case "first":
        default:
          return { text: "草稿", cls: "draft" };
      }
    case "piReview":
      return { text: "组长审核中", cls: "review" };
    case "formatReview":
      return { text: "格式审查中", cls: "review" };
    case "expertReview":
      return { text: "专家审查中", cls: "review" };
    default:
      return { text: item.currentStage, cls: "draft" };
  }
}

/** 阶段 → 印章（计划书卡片用，短文字分行） */
export function stageSeal(item: AupListItem): { lines: string[]; cls: string } {
  switch (item.currentStage) {
    case "approved":
      return { lines: ["已", "批准"], cls: "approved" };
    case "terminated":
      return { lines: ["已", "终止"], cls: "terminated" };
    case "expired":
      return { lines: ["已", "过期"], cls: "terminated" };
    case "draft":
      switch (item.draftSource) {
        case "piReturn":
          return { lines: ["退回", "实验员"], cls: "modify" };
        case "formatReturn":
          return { lines: ["返修", "第1轮"], cls: "modify" };
        case "expertReturn":
          return { lines: ["返修", "第2轮"], cls: "modify" };
        case "rollback":
          return { lines: ["已", "回退"], cls: "modify" };
        case "first":
        default:
          return { lines: ["草稿"], cls: "draft" };
      }
    case "piReview":
      return { lines: ["组长", "审核中"], cls: "review" };
    case "formatReview":
      return { lines: ["格式", "审查中"], cls: "review" };
    case "expertReview":
      return { lines: ["专家", "审查中"], cls: "review" };
    default:
      return { lines: [item.currentStage], cls: "draft" };
  }
}

const STAGE_LABELS: Record<string, string> = {
  piReview: "组长审核",
  formatReview: "格式审查",
  expertReview: "专家审查",
  approved: "审核通过",
  terminated: "已终止",
  expired: "已过期",
};

const DRAFT_SOURCE_LABELS: Record<string, string> = {
  first: "首次填写",
  piReturn: "组长退回修改",
  formatReturn: "格式退回修改",
  expertReturn: "专家退回修改",
  rollback: "回退",
};

export function stageLabel(stage: string, draftSource?: string): string {
  if (stage === "draft") {
    return (draftSource && DRAFT_SOURCE_LABELS[draftSource]) || "填写草稿";
  }
  return STAGE_LABELS[stage] ?? stage;
}

/** 专家投票结论（审核人逐人标记） */
type VoteVerdict = "agree" | "modify" | "disagree" | "unvoted";

const VOTE_LABEL: Record<VoteVerdict, string> = {
  agree: "同意",
  modify: "修改",
  disagree: "拒绝",
  unvoted: "待投",
};

function reviewerVerdict(name: string, agree: string[], modify: string[], disagree: string[]): VoteVerdict {
  if (agree.includes(name)) return "agree";
  if (modify.includes(name)) return "modify";
  if (disagree.includes(name)) return "disagree";
  return "unvoted";
}

/** 操作按钮组（卡片/列表共用；stopPropagation 避免触发行点击展开） */
export function ActionButtons({ actions, stopPropagation }: { actions: ItemAction[]; stopPropagation?: boolean }) {
  return (
    <>
      {actions.map((a) => (
        <button
          key={a.key}
          className={a.primary ? "btn primary small" : "btn ghost small"}
          style={a.danger ? { color: "var(--danger)" } : undefined}
          onClick={(e) => {
            if (stopPropagation) e.stopPropagation();
            a.onClick();
          }}
        >
          {a.label}
        </button>
      ))}
    </>
  );
}

/** 历史快照面板（卡片/列表展开后共用） */
export function SnapshotPanel({ itemId, onViewSnap }: { itemId: number; onViewSnap: (itemId: number, snapshotId: number) => void }) {
  const { data: snaps = [] } = useAupSnapshots(String(itemId));
  const sortedSnaps = useMemo(() => [...snaps].sort((a, b) => b.versionNo - a.versionNo), [snaps]);

  return (
    <div className="snapshot-box">
      <div className="snapshot-title">历史快照 · {sortedSnaps.length}</div>
      {sortedSnaps.length === 0 ? (
        <div className="snapshot-empty">暂无快照</div>
      ) : (
        <table className="snapshot-table">
          <thead>
            <tr>
              <th>版本</th>
              <th>阶段</th>
              <th>记录时间</th>
              <th>操作人</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedSnaps.map((s) => (
              <tr key={s.snapshotId}>
                <td className="snapshot-v">v{s.versionNo}</td>
                <td className="snapshot-stage">{stageLabel(s.stage, s.draftSource)}</td>
                <td className="snapshot-time">{formatDateTimeAsiaShanghaiShort(s.createdAt)}</td>
                <td className="snapshot-time">{s.createdByName || s.createdBy || "—"}</td>
                <td><button className="btn ghost small" onClick={() => onViewSnap(itemId, s.snapshotId)}>查看</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** 卡片「项目名称」：固定两行高度；超出两行时自动缩小字号（最多三行），保证卡片高度一致 */
function ProjectNameTitle({ name, isDemo }: { name?: string; isDemo?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shrunk, setShrunk] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      el.style.fontSize = "13px";
      el.style.display = "block";
      el.style.webkitLineClamp = "none";
      const over = el.scrollHeight - el.clientHeight > 2;
      el.style.fontSize = "";
      el.style.display = "";
      el.style.webkitLineClamp = "";
      setShrunk(over);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [name, isDemo]);

  return (
    <div ref={ref} className={"aup-f-v aup-f-v-title" + (shrunk ? " shrunk" : "")}>
      {name || "（未命名）"}
      {isDemo === 1 && <span className="demo-badge">演示示例</span>}
    </div>
  );
}

/** 计划书式卡片（单条） */
export function AupListCardItem({
  item,
  actions,
  open,
  onToggle,
  onViewSnap,
  showSnapshots = true,
  onCardClick,
  selected = false,
  onToggleSelect,
  selectAll = false,
}: {
  item: AupListItem;
  actions: ItemAction[];
  open?: boolean;
  onToggle?: () => void;
  onViewSnap?: (itemId: number, snapshotId: number) => void;
  showSnapshots?: boolean;
  onCardClick?: () => void;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
  selectAll?: boolean;
}) {
  const seal = stageSeal(item);
  const reviewers = (item.reviewerNames || "").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const agreeList = item.agreeNames ?? [];
  const modifyList = item.modifyNames ?? [];
  const disagreeList = item.disagreeNames ?? [];
  const hasExpertVotes = agreeList.length + modifyList.length + disagreeList.length > 0;
  const showVoteBadges = item.currentStage === "expertReview" || hasExpertVotes;
  const registerNo = item.registerNo || "待编号";
  const handleClick = onCardClick ?? onToggle;

  return (
    <div className="aup-card-cell">
      <div className="aup-doc-stack">
        <div className="aup-doc" onClick={handleClick}>
          <div className="aup-doc-hd">
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              {onToggleSelect && (
                <input
                  type="checkbox"
                  checked={selectAll || selected}
                  onChange={() => onToggleSelect(item.id)}
                  onClick={(e) => e.stopPropagation()}
                  title="勾选以批量删除"
                  style={{ width: 15, height: 15, cursor: "pointer", accentColor: "var(--primary, #002FA7)", flexShrink: 0 }}
                />
              )}
              <span className="aup-doc-title">实验动物使用计划书</span>
            </div>
            <span className="aup-doc-no">编号：{registerNo}</span>
          </div>
          <div className="aup-doc-body">
            <div className="aup-f">
              <div className="aup-f-k">项目名称</div>
              <ProjectNameTitle name={item.projectName} isDemo={item.isDemo} />
            </div>
            <div className="aup-f2">
              <div className="aup-f">
                <div className="aup-f-k">课题组负责人</div>
                <div className="aup-f-v">{item.piName || "—"}</div>
              </div>
              <div className="aup-f">
                <div className="aup-f-k">所属部门</div>
                <div className="aup-f-v">{item.dept || "—"}</div>
              </div>
            </div>
            <div className="aup-f">
              <div className="aup-f-k">项目来源</div>
              <div className="aup-f-v">{item.projectSource || "—"}</div>
            </div>
            <div className="aup-f">
              <div className="aup-f-k">审核人</div>
              <div className="aup-reviewers">
                {reviewers.length === 0 ? (
                  <span className="aup-f-v" style={{ borderBottom: "none", paddingBottom: 4 }}>—</span>
                ) : showVoteBadges ? (
                  reviewers.map((r) => {
                    const v = reviewerVerdict(r, agreeList, modifyList, disagreeList);
                    return (
                      <span key={r} className="aup-reviewer">
                        <span className={"aup-vote-badge " + v}>{VOTE_LABEL[v]}</span>
                        <span className="aup-reviewer-name">{r}</span>
                      </span>
                    );
                  })
                ) : (
                  <span className="aup-f-v" style={{ borderBottom: "none", paddingBottom: 4 }}>{reviewers.join(" · ")}</span>
                )}
              </div>
            </div>
            <div className="aup-doc-steps">
              <MiniStageIndicator miniSteps={item.miniSteps} />
            </div>
          </div>
          <div className="aup-doc-foot">
            <div className="aup-doc-acts">
              <ActionButtons actions={actions} stopPropagation />
            </div>
            <div className="aup-doc-foot-right">
              {showSnapshots && onToggle && onViewSnap ? (
                <button className="aup-snap-toggle" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
                  {open ? "▾" : "▸"} 快照({item.snapshotCount ?? 0})
                </button>
              ) : null}
              <div className={"aup-seal " + seal.cls}>
                {seal.lines.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {showSnapshots && open && onViewSnap ? (
        <div className="aup-doc-snap">
          <SnapshotPanel itemId={item.id} onViewSnap={onViewSnap} />
        </div>
      ) : null}
    </div>
  );
}

/** 卡片网格：GSAP 淡入 + 上移交错入场 */
export function AupListCardGrid({
  items,
  genKey,
  getActions,
  expanded,
  onToggle,
  onViewSnap,
  showSnapshots = true,
  onCardClick,
  selectedIds,
  onToggleSelect,
  selectAll,
}: {
  items: AupListItem[];
  genKey: string;
  getActions: (item: AupListItem) => ItemAction[];
  expanded?: Set<number>;
  onToggle?: (id: number) => void;
  onViewSnap?: (itemId: number, snapshotId: number) => void;
  showSnapshots?: boolean;
  onCardClick?: (item: AupListItem) => void;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  selectAll?: boolean;
}) {
  const gridRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const cells = gridRef.current?.querySelectorAll(".aup-card-cell");
      if (!cells || cells.length === 0) return;
      gsap.fromTo(
        cells,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: "power2.out", overwrite: true }
      );
    },
    { scope: gridRef, dependencies: [genKey], revertOnUpdate: true }
  );

  return (
    <div className="aup-card-grid" ref={gridRef}>
      {items.map((item) => (
        <AupListCardItem
          key={item.id}
          item={item}
          actions={getActions(item)}
          open={expanded?.has(item.id)}
          onToggle={onToggle ? () => onToggle(item.id) : undefined}
          onViewSnap={onViewSnap}
          showSnapshots={showSnapshots}
          onCardClick={onCardClick ? () => onCardClick(item) : undefined}
          selected={selectedIds?.has(item.id)}
          onToggleSelect={onToggleSelect}
          selectAll={selectAll}
        />
      ))}
    </div>
  );
}

export type { AupStage, DraftSource };
