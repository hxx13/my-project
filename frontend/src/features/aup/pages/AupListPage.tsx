import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useMutation } from "@tanstack/react-query";
import { useAupListInfinite, useRestoreAupDemo, useDeleteAup, useUnlockAup, useRenewAup, useReviewerConfig, useAupProjectGroups } from "../hooks/useAup";
import { batchDeleteAup, reseedAupDemo, syncAupFromAro } from "../api/aup.api";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import type { AupListItem, AupStage, DraftSource } from "../schema/aup";
import MiniStageIndicator from "../components/MiniStageIndicator";
import {
  ActionButtons,
  AupListCardGrid,
  SnapshotPanel,
  stageBadge,
  type ItemAction,
} from "../components/AupListCard";
import { appConfirm } from "@/lib/appDialog";
import "../aup.css";

const PAGE_SIZE = 10;

type ViewMode = "card" | "list";
type ListTab = "pending" | "approved" | "expired";

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
  selectedIds,
  onToggleSelect,
  selectAll,
}: {
  items: AupListItem[];
  getActions: (item: AupListItem) => ItemAction[];
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onViewSnap: (itemId: number, snapshotId: number) => void;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  selectAll?: boolean;
}) {
  return (
    <table className="list-table">
      <thead>
        <tr>
          <th style={{ width: 36 }}></th>
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
                <td style={{ width: 36, paddingRight: 0 }}>
                  <input
                    type="checkbox"
                    checked={selectAll || selectedIds?.has(item.id)}
                    onChange={() => onToggleSelect?.(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    title="勾选以批量删除"
                  />
                </td>
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
                  <td colSpan={11}>
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

export default function AupListPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>("card");
  const [keyword, setKeyword] = useState("");
  const [stage, setStage] = useState<AupStage | "">("");
  const [tab, setTab] = useState<ListTab>("pending");
  const [projectGroupName, setProjectGroupName] = useState("");
  const [dept, setDept] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [registerNo, setRegisterNo] = useState("");
  const [draftSource, setDraftSource] = useState<DraftSource | "">("");
  const [roundNo, setRoundNo] = useState("");
  const [sortBy, setSortBy] = useState("registerNo");
  const [desc, setDesc] = useState(true);
  const [relatedToMe, setRelatedToMe] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevGenKeyRef = useRef("");
  const projectGroupsQuery = useAupProjectGroups();
  const restoreMut = useRestoreAupDemo();
  const deleteMut = useDeleteAup();
  const unlockMut = useUnlockAup();
  const renewMut = useRenewAup();
  const [syncing, setSyncing] = useState(false);
  const isAdmin = hasMinRole(authStorage.getRole() || "", "ADMIN");
  const isPlatformOwner = hasMinRole(authStorage.getRole() || "", "PLATFORM_OWNER");
  const currentUserId = authStorage.getUserInfo()?.id;
  const reviewerConfigQuery = useReviewerConfig();
  const isSecretary = (reviewerConfigQuery.data?.formatReviewers ?? []).some(
    (r) => r.userId === currentUserId
  );

  const filters = useMemo(
    () => ({
      size: PAGE_SIZE,
      keyword: keyword.trim() || undefined,
      registerNo: registerNo.trim() || undefined,
      stage: tab === "approved" ? ("approved" as AupStage) : tab === "expired" ? ("expired" as AupStage) : stage || undefined,
      excludeStages: tab === "pending" ? (["approved", "expired"] as AupStage[]) : undefined,
      excludeDraft: true,
      draftSource: tab === "pending" ? draftSource || undefined : undefined,
      roundNo: tab === "pending" && roundNo ? Number(roundNo) : undefined,
      projectGroupName: projectGroupName.trim() || undefined,
      dept: dept.trim() || undefined,
      submitterName: submitterName.trim() || undefined,
      reviewerName: reviewerName.trim() || undefined,
      relatedToMe: relatedToMe || undefined,
      sortBy: sortBy || undefined,
      sortDir: (desc ? "desc" : "asc") as "asc" | "desc",
    }),
    [keyword, registerNo, stage, tab, draftSource, roundNo, projectGroupName, dept, submitterName, reviewerName, relatedToMe, sortBy, desc]
  );

  // 筛选/标签变化 → genKey 变化：重播入场动画 + 滚动回顶
  const genKey = useMemo(() => JSON.stringify(filters), [filters]);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAupListInfinite(filters);

  const items = useMemo(() => {
    const rawItems = (data?.pages ?? []).flatMap((p) => p.items ?? []);
    // demo 记录（isDemo === 1）在有真实记录时自动隐藏；若全是 demo 则保留以便演示
    const hasRealRecord = rawItems.some((i) => i.isDemo !== 1);
    return hasRealRecord ? rawItems.filter((i) => i.isDemo !== 1) : rawItems;
  }, [data]);

  const total = data?.pages?.[0]?.total ?? 0;

  // 滚动容器到底（提前 300px）时自动加载下一页
  useEffect(() => {
    const scroller = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!scroller || !sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: scroller, rootMargin: "300px 0px" }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 筛选变化时滚动回顶部，避免停留在旧列表的底部
  useEffect(() => {
    if (prevGenKeyRef.current !== genKey) {
      prevGenKeyRef.current = genKey;
      scrollRef.current?.scrollTo({ top: 0 });
    }
  }, [genKey]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openReview = (id: number) => navigate(`/console/admin/aup/review/${id}`);
  const handleRestore = (id: number) => restoreMut.mutate(id);
  const handleDelete = async (id: number) => {
    if (await appConfirm("确定删除该计划书？删除后不可恢复。")) deleteMut.mutate(id);
  };
  const toggleSelect = (id: number) => {
    setSelectAll(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectedCount = selectAll ? total : selectedIds.size;
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectAll(false);
      setSelectedIds(new Set());
    } else {
      setSelectAll(true);
      setSelectedIds(new Set());
    }
  };
  const batchDeleteMut = useMutation({
    mutationFn: () => {
      if (selectAll) return batchDeleteAup({ selectAll: true, ...filters });
      return batchDeleteAup({ ids: [...selectedIds] });
    },
    onSuccess: (r) => {
      const failed = r.failed?.length ?? 0;
      toast.success(`已删除 ${r.deletedCount ?? 0} 条${failed > 0 ? `，${failed} 条失败（无权限/不可删）` : ""}`);
      setSelectAll(false);
      setSelectedIds(new Set());
      refetch();
    },
    onError: (e: Error) => toast.error(e.message || "批量删除失败"),
  });
  const handleUnlock = async (id: number) => {
    if (await appConfirm("解锁后计划书将回到返修（草稿）状态，可重新提交审核。确定解锁？")) unlockMut.mutate(id);
  };
  const handleRenew = async (id: number) => {
    if (!await appConfirm("续期将基于该已过期计划书新建一份草稿（引用原注册号、结转未用动物数），重新走审核流程。确定续期？")) return;
    try {
      const res = await renewMut.mutateAsync(id);
      if (res?.id) navigate(`/aup/fill/${res.id}`);
    } catch {
      /* toast 已由 hook 处理 */
    }
  };

  const handleSync = async () => {
    if (!await appConfirm("从 ARO 全量同步计划书（正文 + 状态 + 评审记录），可能耗时较久。确定同步？")) return;
    setSyncing(true);
    try {
      const res = await syncAupFromAro();
      toast.success(`同步完成：新增 ${res.inserted}，更新 ${res.updated}，评审 ${res.reviewCount}，失败 ${res.failed}`);
      refetch();
    } catch (e) {
      toast.error(`同步失败：${e instanceof Error ? e.message : "未知错误"}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleReseedDemo = async () => {
    if (!await appConfirm("按内置种子重新生成演示示例（补齐缺失的 demo 计划书，幂等）。确定？")) return;
    try {
      await reseedAupDemo();
      toast.success("演示示例已重新生成");
      refetch();
    } catch (e) {
      toast.error(`重新生成失败：${e instanceof Error ? e.message : "未知错误"}`);
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
            <button className={tab === "pending" ? "on" : ""} onClick={() => { setTab("pending"); }}>未通过</button>
            <button className={tab === "approved" ? "on" : ""} onClick={() => { setTab("approved"); setStage(""); }}>已通过</button>
            <button className={tab === "expired" ? "on" : ""} onClick={() => { setTab("expired"); setStage(""); }}>已过期</button>
          </div>
          <button
            className={relatedToMe ? "btn primary small" : "btn ghost small"}
            onClick={() => { setRelatedToMe((v) => !v); }}
          >
            与我相关
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selectAll}
              onChange={toggleSelectAll}
              title="全选 / 取消全选（含未加载，按当前筛选）"
            />
            全选
          </label>
          {selectedCount > 0 && (
            <button
              className="btn danger small"
              disabled={batchDeleteMut.isPending}
              onClick={async () => {
                if (await appConfirm(`批量删除选中的 ${selectedCount} 条计划书？删除后不可恢复。`)) {
                  batchDeleteMut.mutate();
                }
              }}
            >
              {batchDeleteMut.isPending ? "删除中…" : `批量删除 (${selectedCount})`}
            </button>
          )}
          {isAdmin ? (
            <>
              <button
                className="btn ghost small"
                disabled={syncing}
                onClick={handleSync}
                title="从 ARO 全量同步计划书（正文 + 状态 + 评审记录）"
              >
                {syncing ? "同步中…" : "同步 ARO"}
              </button>
              <button
                className="btn ghost small"
                onClick={handleReseedDemo}
                title="按内置种子重新生成演示示例"
              >
                重新生成示例
              </button>
            </>
          ) : null}
          <button
            className="btn ghost small"
            onClick={() => { setDesc((v) => !v); }}
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
              onChange={(e) => { setSortBy(e.target.value); }}
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
              onChange={(e) => { setKeyword(e.target.value); }}
            />
          </label>
          <label style={FILTER_FIELD_STYLE}>
            编号
            <input
              className="input"
              style={FILTER_CONTROL_STYLE}
              placeholder="注册号精确匹配"
              value={registerNo}
              onChange={(e) => { setRegisterNo(e.target.value); }}
            />
          </label>
          {tab === "pending" && (
            <label style={FILTER_FIELD_STYLE}>
              阶段
              <select
                className="select"
                style={FILTER_CONTROL_STYLE}
                value={stage}
                onChange={(e) => { setStage(e.target.value as AupStage | ""); }}
              >
                <option value="">全部</option>
                <option value="draft">草稿</option>
                <option value="piReview">组长审核中</option>
                <option value="formatReview">格式审查中</option>
                <option value="expertReview">专家审查中</option>
                <option value="terminated">已终止</option>
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
                onChange={(e) => { setDraftSource(e.target.value as DraftSource | ""); }}
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
                onChange={(e) => { setRoundNo(e.target.value); }}
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
            <input
              className="input"
              style={FILTER_CONTROL_STYLE}
              placeholder="输入课题组名，模糊匹配"
              value={projectGroupName}
              list="aup-project-group-options"
              onChange={(e) => { setProjectGroupName(e.target.value); }}
            />
            <datalist id="aup-project-group-options">
              {(projectGroupsQuery.data ?? []).map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
          <label style={FILTER_FIELD_STYLE}>
            部门
            <input
              className="input"
              style={FILTER_CONTROL_STYLE}
              placeholder="输入部门名，模糊匹配"
              value={dept}
              onChange={(e) => { setDept(e.target.value); }}
            />
          </label>
          <label style={FILTER_FIELD_STYLE}>
            提交人
            <input
              className="input"
              style={FILTER_CONTROL_STYLE}
              placeholder="提交人姓名"
              value={submitterName}
              onChange={(e) => { setSubmitterName(e.target.value); }}
            />
          </label>
          <label style={FILTER_FIELD_STYLE}>
            审核人
            <input
              className="input"
              style={FILTER_CONTROL_STYLE}
              placeholder="审核人姓名"
              value={reviewerName}
              onChange={(e) => { setReviewerName(e.target.value); }}
            />
          </label>
        </div>
        )}
      </div>

      {/* 下卡片：无限滚动内容 + 底部加载状态 */}
      <div className="list-card list-card-body">
        <div className="list-card-scroll" ref={scrollRef}>
          {isLoading ? (
            <div className="aup-empty">加载中…</div>
          ) : isError ? (
            <div className="aup-empty">
              加载失败，<button className="btn ghost small" onClick={() => refetch()}>重试</button>
            </div>
          ) : items.length === 0 ? (
            <div className="aup-empty">暂无匹配的计划书</div>
          ) : view === "card" ? (
            <AupListCardGrid
              items={items}
              genKey={genKey}
              getActions={getActions}
              expanded={expanded}
              onToggle={toggle}
              onViewSnap={onViewSnap}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              selectAll={selectAll}
            />
          ) : (
            <ListTable
              items={items}
              getActions={getActions}
              expanded={expanded}
              onToggle={toggle}
              onViewSnap={onViewSnap}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              selectAll={selectAll}
            />
          )}
          {/* 滚动加载哨兵：接近底部时触发加载下一页 */}
          {(hasNextPage || isFetchingNextPage) && items.length > 0 && (
            <div ref={sentinelRef} className="aup-load-more">
              {isFetchingNextPage ? "加载中…" : "下拉加载更多"}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="list-pager">
            <span>已加载 {items.length} / 共 {total} 条</span>
            <span className="spacer" />
            {!hasNextPage && <span style={{ color: "var(--muted)" }}>已加载全部</span>}
          </div>
        )}
      </div>
    </div>
  );
}
