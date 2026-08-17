import { Fragment, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useAupList, useRestoreAupDemo, useDeleteAup, useUnlockAup, useRenewAup, useReviewerConfig, useAupSnapshots, useAupProjectGroups } from "../hooks/useAup";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import type { AupListItem, AupStage, DraftSource } from "../schema/aup";
import MiniStageIndicator from "../components/MiniStageIndicator";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import "../aup.css";

gsap.registerPlugin(useGSAP);

const PAGE_SIZE = 10;

type ViewMode = "card" | "list";

/** 一条操作按钮描述，卡片/列表共用 */
type ItemAction = { key: string; label: string; primary?: boolean; danger?: boolean; onClick: () => void };

/** 筛选卡片「小标签 + 输入框」通用样式（沿用 aup.css 变量，紧凑布局） */
const FILTER_FIELD_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  fontSize: 11,
  color: "var(--muted)",
};

/** 筛选控件紧凑样式（沿用 .input/.select 类，仅收紧内边距与字号） */
const FILTER_CONTROL_STYLE: CSSProperties = { padding: "4px 8px", fontSize: 12 };

/** 阶段 → 状态徽标（列表视图用） */
function stageBadge(item: AupListItem): { text: string; cls: string } {
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
function stageSeal(item: AupListItem): { lines: string[]; cls: string } {
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
function ActionButtons({ actions, stopPropagation }: { actions: ItemAction[]; stopPropagation?: boolean }) {
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
function SnapshotPanel({ itemId, onViewSnap }: { itemId: number; onViewSnap: (itemId: number, snapshotId: number) => void }) {
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
                <td className="snapshot-time">{s.createdBy || "—"}</td>
                <td><button className="btn ghost small" onClick={() => onViewSnap(itemId, s.snapshotId)}>查看</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** 计划书式卡片（单条） */
function CardItem({
  item,
  actions,
  open,
  onToggle,
  onViewSnap,
}: {
  item: AupListItem;
  actions: ItemAction[];
  open: boolean;
  onToggle: () => void;
  onViewSnap: (itemId: number, snapshotId: number) => void;
}) {
  const stackRef = useRef<HTMLDivElement>(null);
  const seal = stageSeal(item);
  const reviewers = (item.reviewerNames || "").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const agreeList = item.agreeNames ?? [];
  const modifyList = item.modifyNames ?? [];
  const disagreeList = item.disagreeNames ?? [];
  const hasExpertVotes = agreeList.length + modifyList.length + disagreeList.length > 0;
  const showVoteBadges = item.currentStage === "expertReview" || hasExpertVotes;
  const registerNo = item.registerNo || "待编号";

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = stackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    gsap.to(el, { rotateY: px * 8, rotateX: -py * 8, y: -6, transformPerspective: 900, duration: 0.4, ease: "power2.out" });
  };
  const handleLeave = () => {
    const el = stackRef.current;
    if (el) gsap.to(el, { rotateY: 0, rotateX: 0, y: 0, duration: 0.6, ease: "power3.out" });
  };

  return (
    <div className="aup-card-cell">
      <div className="aup-doc-stack" ref={stackRef} onMouseMove={handleMove} onMouseLeave={handleLeave}>
        <div className="aup-doc" onClick={onToggle}>
          <div className="aup-doc-hd">
            <span className="aup-doc-title">实验动物使用计划书</span>
            <span className="aup-doc-no">编号：{registerNo}</span>
          </div>
          <div className="aup-doc-body">
            <div className="aup-f">
              <div className="aup-f-k">项目名称</div>
              <div className="aup-f-v">
                {item.projectName || "（未命名）"}
                {item.isDemo === 1 && <span className="demo-badge">演示示例</span>}
              </div>
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
              <button className="aup-snap-toggle" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
                {open ? "▾" : "▸"} 快照({item.snapshotCount ?? 0})
              </button>
              <div className={"aup-seal " + seal.cls}>
                {seal.lines.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {open && (
        <div className="aup-doc-snap">
          <SnapshotPanel itemId={item.id} onViewSnap={onViewSnap} />
        </div>
      )}
    </div>
  );
}

/** 卡片网格：GSAP 淡入 + 上移交错入场 */
function CardGrid({
  items,
  page,
  getActions,
  expanded,
  onToggle,
  onViewSnap,
}: {
  items: AupListItem[];
  page: number;
  getActions: (item: AupListItem) => ItemAction[];
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onViewSnap: (itemId: number, snapshotId: number) => void;
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
    { scope: gridRef, dependencies: [items, page], revertOnUpdate: true }
  );

  return (
    <div className="aup-card-grid" ref={gridRef}>
      {items.map((item) => (
        <CardItem
          key={item.id}
          item={item}
          actions={getActions(item)}
          open={expanded.has(item.id)}
          onToggle={() => onToggle(item.id)}
          onViewSnap={onViewSnap}
        />
      ))}
    </div>
  );
}

/** 人名标签（列表视图用） */
function PersonChips({ names }: { names: string[] }) {
  if (!names || names.length === 0) return <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>;
  return (
    <span className="aup-chips">
      {names.map((n, i) => (
        <span className="aup-chip" key={i}>{n}</span>
      ))}
    </span>
  );
}

/** 列表视图：单行表格 + 展开快照 */
function ListTable({
  items,
  getActions,
  expanded,
  onToggle,
  onViewSnap,
}: {
  items: AupListItem[];
  getActions: (item: AupListItem) => ItemAction[];
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onViewSnap: (itemId: number, snapshotId: number) => void;
}) {
  return (
    <table className="list-table">
      <thead>
        <tr>
          <th>编号</th>
          <th>项目名称</th>
          <th>课题组负责人</th>
          <th>所属部门</th>
          <th>项目来源</th>
          <th>审核人</th>
          <th>同意人</th>
          <th>修改人</th>
          <th>状态</th>
          <th className="th-prog">进度 / 操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const badge = stageBadge(item);
          const open = expanded.has(item.id);
          const reviewers = (item.reviewerNames || "").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
          const agreeList = item.agreeNames ?? [];
          const modifyList = item.modifyNames ?? [];
          return (
            <Fragment key={item.id}>
              <tr className="row" onClick={() => onToggle(item.id)}>
                <td>
                  {item.registerNo ? (
                    <span style={{ fontFamily: "monospace", color: "var(--primary)", fontWeight: 600, whiteSpace: "nowrap" }}>{item.registerNo}</span>
                  ) : (
                    <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>草稿</span>
                  )}
                </td>
                <td style={{ maxWidth: 240 }}>
                  <div className="proj-name" title={item.projectName || ""}>
                    <span className="aup-expand">{open ? "▾" : "▸"}</span> {item.projectName || "（未命名）"}
                    {item.isDemo === 1 && <span className="demo-badge">演示示例</span>}
                  </div>
                </td>
                <td style={{ maxWidth: 110 }}>
                  <span className="pi-name" title={item.piName || ""}>{item.piName || "—"}</span>
                </td>
                <td>{item.dept || "—"}</td>
                <td>{item.projectSource || "—"}</td>
                <td><PersonChips names={reviewers} /></td>
                <td><PersonChips names={agreeList} /></td>
                <td><PersonChips names={modifyList} /></td>
                <td><span className={"status-badge " + badge.cls}>{badge.text}</span></td>
                <td className="prog-cell">
                  <div className="prog-line"><MiniStageIndicator miniSteps={item.miniSteps} /></div>
                  <div className="prog-acts"><ActionButtons actions={getActions(item)} stopPropagation /></div>
                </td>
              </tr>
              {open && (
                <tr className="snapshot-row">
                  <td colSpan={10}>
                    <SnapshotPanel itemId={item.id} onViewSnap={onViewSnap} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
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

function stageLabel(stage: string, draftSource?: string): string {
  if (stage === "draft") {
    return (draftSource && DRAFT_SOURCE_LABELS[draftSource]) || "填写草稿";
  }
  return STAGE_LABELS[stage] ?? stage;
}

export default function AupListPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>("card");
  const [keyword, setKeyword] = useState("");
  const [stage, setStage] = useState<AupStage | "">("");
  const [tab, setTab] = useState<"approved" | "pending">("pending");
  const [projectGroupName, setProjectGroupName] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [registerNo, setRegisterNo] = useState("");
  const [draftSource, setDraftSource] = useState<DraftSource | "">("");
  const [roundNo, setRoundNo] = useState("");
  const [sortBy, setSortBy] = useState("updatedAt");
  const [desc, setDesc] = useState(true);
  const [relatedToMe, setRelatedToMe] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const projectGroupsQuery = useAupProjectGroups();
  const restoreMut = useRestoreAupDemo();
  const deleteMut = useDeleteAup();
  const unlockMut = useUnlockAup();
  const renewMut = useRenewAup();
  const isAdmin = hasMinRole(authStorage.getRole() || "", "ADMIN");
  const isPlatformOwner = hasMinRole(authStorage.getRole() || "", "PLATFORM_OWNER");
  const currentUserId = authStorage.getUserInfo()?.id;
  const reviewerConfigQuery = useReviewerConfig();
  const isSecretary = (reviewerConfigQuery.data?.formatReviewers ?? []).some(
    (r) => r.userId === currentUserId
  );

  const params = useMemo(
    () => ({
      page,
      size: PAGE_SIZE,
      keyword: keyword.trim() || undefined,
      registerNo: registerNo.trim() || undefined,
      stage: tab === "approved" ? ("approved" as AupStage) : stage || undefined,
      excludeStage: tab === "approved" ? undefined : ("approved" as AupStage),
      excludeDraft: true,
      draftSource: tab === "pending" ? draftSource || undefined : undefined,
      roundNo: tab === "pending" && roundNo ? Number(roundNo) : undefined,
      projectGroupName: projectGroupName.trim() || undefined,
      submitterName: submitterName.trim() || undefined,
      reviewerName: reviewerName.trim() || undefined,
      relatedToMe: relatedToMe || undefined,
      sortBy: sortBy || undefined,
      sortDir: (desc ? "desc" : "asc") as "asc" | "desc",
    }),
    [page, keyword, registerNo, stage, tab, draftSource, roundNo, projectGroupName, submitterName, reviewerName, relatedToMe, sortBy, desc]
  );

  const { data, isLoading, isError, refetch } = useAupList(params);

  const items = useMemo(() => {
    const rawItems = data?.items ?? [];
    // demo 记录（isDemo === 1）在有真实记录时自动隐藏；若全是 demo 则保留以便演示
    const hasRealRecord = rawItems.some((i) => i.isDemo !== 1);
    return hasRealRecord ? rawItems.filter((i) => i.isDemo !== 1) : rawItems;
  }, [data]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openReview = (id: number) => navigate(`/console/admin/aup/review/${id}`);
  const handleRestore = (id: number) => restoreMut.mutate(id);
  const handleDelete = (id: number) => {
    if (window.confirm("确定删除该计划书？删除后不可恢复。")) deleteMut.mutate(id);
  };
  const handleUnlock = (id: number) => {
    if (window.confirm("解锁后计划书将回到返修（草稿）状态，可重新提交审核。确定解锁？")) unlockMut.mutate(id);
  };
  const handleRenew = async (id: number) => {
    if (!window.confirm("续期将基于该已过期计划书新建一份草稿（引用原注册号、结转未用动物数），重新走审核流程。确定续期？")) return;
    try {
      const res = await renewMut.mutateAsync(id);
      if (res?.id) navigate(`/aup/fill/${res.id}`);
    } catch {
      /* toast 已由 hook 处理 */
    }
  };

  const getActions = (item: AupListItem): ItemAction[] => {
    const acts: ItemAction[] = [];
    const isFormatAction = item.currentStage === "formatReview" && isSecretary;
    const isExpertAction = item.currentStage === "expertReview" && (item.assignedExpertCount ?? 0) > 0;
    const isOwnDraft = item.currentStage === "draft" && item.createdBy === currentUserId;
    const reviewLabel = isOwnDraft ? "填写/继续" : isFormatAction ? "格式审查" : isExpertAction ? "内容审查" : "查看";
    const reviewPrimary = isOwnDraft || isFormatAction || isExpertAction;

    if (item.currentStage === "expired" && isAdmin) {
      acts.push({ key: "renew", label: "续期", primary: true, onClick: () => handleRenew(item.id) });
    }
    acts.push({
      key: "review",
      label: reviewLabel,
      primary: reviewPrimary,
      onClick: () => (isOwnDraft ? navigate(`/aup/fill/${item.id}`) : openReview(item.id)),
    });
    if (item.isDemo === 1) {
      acts.push({ key: "restore", label: "恢复示例", onClick: () => handleRestore(item.id) });
    } else if (isPlatformOwner || (item.currentStage === "draft" && item.draftSource === "first" && item.createdBy === currentUserId)) {
      acts.push({ key: "delete", label: "删除", danger: true, onClick: () => handleDelete(item.id) });
    }
    if (isAdmin && (item.currentStage === "terminated" || item.currentStage === "approved" || item.currentStage === "expired")) {
      acts.push({ key: "unlock", label: "解锁返修", onClick: () => handleUnlock(item.id) });
    }
    return acts;
  };

  const onViewSnap = (itemId: number, snapId: number) => navigate(`/aup/fill/${itemId}?snapshot=${snapId}`);

  /** 当前生效的筛选条件数（用于折叠按钮角标） */
  const activeFilterCount = [
    keyword.trim(),
    registerNo.trim(),
    tab === "pending" ? stage : "",
    tab === "pending" ? draftSource : "",
    tab === "pending" ? roundNo : "",
    projectGroupName.trim(),
    submitterName.trim(),
    reviewerName.trim(),
  ].filter(Boolean).length;

  return (
    <div className="aup-app aup-list-fixed">
      {/* 上卡片：视角切换 + 筛选 */}
      <div className="list-card list-card-top">
        <div className="aup-filter-toolbar">
          <div className="aup-view-toggle" role="tablist" aria-label="视图切换">
            <button className={view === "card" ? "on" : ""} onClick={() => setView("card")}>▦ 卡片</button>
            <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>☰ 列表</button>
          </div>
          <div className="aup-view-toggle" role="tablist" aria-label="审核状态">
            <button className={tab === "pending" ? "on" : ""} onClick={() => { setTab("pending"); setPage(1); }}>未通过</button>
            <button className={tab === "approved" ? "on" : ""} onClick={() => { setTab("approved"); setStage(""); setPage(1); }}>已通过</button>
          </div>
          <button
            className={relatedToMe ? "btn primary small" : "btn ghost small"}
            onClick={() => { setRelatedToMe((v) => !v); setPage(1); }}
          >
            与我相关
          </button>
          <button
            className="btn ghost small"
            onClick={() => { setDesc((v) => !v); setPage(1); }}
            title={desc ? "当前倒序（最新在前）" : "当前正序（最早在前）"}
          >
            {desc ? "↓ 倒序" : "↑ 正序"}
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
            排序
            <select
              className="select"
              style={FILTER_CONTROL_STYLE}
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            >
              <option value="updatedAt">更新时间</option>
              <option value="submittedAt">提交时间</option>
              <option value="approvedAt">批准时间</option>
              <option value="registerNo">编号</option>
            </select>
          </label>
          <button
            className="btn ghost small"
            style={{ marginLeft: "auto" }}
            onClick={() => setFilterOpen((v) => !v)}
          >
            筛选 {filterOpen ? "▾" : "▸"}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>共 {total} 条</span>
        </div>

        {filterOpen && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
          <label style={FILTER_FIELD_STYLE}>
            关键词
            <input
              className="input"
              style={FILTER_CONTROL_STYLE}
              placeholder="编号 / 项目名称 / 负责人"
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
            />
          </label>
          <label style={FILTER_FIELD_STYLE}>
            编号
            <input
              className="input"
              style={FILTER_CONTROL_STYLE}
              placeholder="注册号精确匹配"
              value={registerNo}
              onChange={(e) => { setRegisterNo(e.target.value); setPage(1); }}
            />
          </label>
          {tab === "pending" && (
            <label style={FILTER_FIELD_STYLE}>
              阶段
              <select
                className="select"
                style={FILTER_CONTROL_STYLE}
                value={stage}
                onChange={(e) => { setStage(e.target.value as AupStage | ""); setPage(1); }}
              >
                <option value="">全部</option>
                <option value="draft">草稿</option>
                <option value="piReview">组长审核中</option>
                <option value="formatReview">格式审查中</option>
                <option value="expertReview">专家审查中</option>
                <option value="terminated">已终止</option>
                <option value="expired">已过期</option>
              </select>
            </label>
          )}
          {tab === "pending" && (
            <label style={FILTER_FIELD_STYLE}>
              草稿来源
              <select
                className="select"
                style={FILTER_CONTROL_STYLE}
                value={draftSource}
                onChange={(e) => { setDraftSource(e.target.value as DraftSource | ""); setPage(1); }}
              >
                <option value="">全部</option>
                <option value="first">首次提交</option>
                <option value="piReturn">组长退回</option>
                <option value="formatReturn">格式返修</option>
                <option value="expertReturn">专家返修</option>
                <option value="rollback">已回退</option>
              </select>
            </label>
          )}
          {tab === "pending" && (
            <label style={FILTER_FIELD_STYLE}>
              轮次
              <select
                className="select"
                style={FILTER_CONTROL_STYLE}
                value={roundNo}
                onChange={(e) => { setRoundNo(e.target.value); setPage(1); }}
              >
                <option value="">全部</option>
                <option value="1">第 1 轮</option>
                <option value="2">第 2 轮</option>
                <option value="3">第 3 轮</option>
                <option value="4">第 4 轮</option>
              </select>
            </label>
          )}
          <label style={FILTER_FIELD_STYLE}>
            课题组
            <select
              className="select"
              style={FILTER_CONTROL_STYLE}
              value={projectGroupName}
              onChange={(e) => { setProjectGroupName(e.target.value); setPage(1); }}
            >
              <option value="">全部课题组</option>
              {(projectGroupsQuery.data ?? []).map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          <label style={FILTER_FIELD_STYLE}>
            提交人
            <input
              className="input"
              style={FILTER_CONTROL_STYLE}
              placeholder="提交人姓名"
              value={submitterName}
              onChange={(e) => { setSubmitterName(e.target.value); setPage(1); }}
            />
          </label>
          <label style={FILTER_FIELD_STYLE}>
            审核人
            <input
              className="input"
              style={FILTER_CONTROL_STYLE}
              placeholder="审核人姓名"
              value={reviewerName}
              onChange={(e) => { setReviewerName(e.target.value); setPage(1); }}
            />
          </label>
        </div>
        )}
      </div>

      {/* 下卡片：可滚动内容 + 分页 */}
      <div className="list-card list-card-body">
        <div className="list-card-scroll">
          {isLoading ? (
            <div className="aup-empty">加载中…</div>
          ) : isError ? (
            <div className="aup-empty">
              加载失败，<button className="btn ghost small" onClick={() => refetch()}>重试</button>
            </div>
          ) : items.length === 0 ? (
            <div className="aup-empty">暂无匹配的计划书</div>
          ) : view === "card" ? (
            <CardGrid
              items={items}
              page={page}
              getActions={getActions}
              expanded={expanded}
              onToggle={toggle}
              onViewSnap={onViewSnap}
            />
          ) : (
            <ListTable
              items={items}
              getActions={getActions}
              expanded={expanded}
              onToggle={toggle}
              onViewSnap={onViewSnap}
            />
          )}
        </div>

        {totalPages > 1 && (
          <div className="list-pager">
            <span>第 {page} / {totalPages} 页</span>
            <span className="spacer" />
            <button className="btn ghost small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
            <button className="btn ghost small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
          </div>
        )}
      </div>
    </div>
  );
}
