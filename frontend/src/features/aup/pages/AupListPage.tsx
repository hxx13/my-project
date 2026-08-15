import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAupList, useRestoreAupDemo, useDeleteAup, useUnlockAup, useRenewAup, useReviewerConfig } from "../hooks/useAup";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import type { AupListItem, AupStage } from "../schema/aup";
import MiniStageIndicator from "../components/MiniStageIndicator";
import SnapshotDrawer from "../components/SnapshotDrawer";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import "../aup.css";

const PAGE_SIZE = 10;

/** 阶段 → 状态徽标 */
function stageBadge(item: AupListItem): { text: string; cls: string } {
  switch (item.currentStage) {
    case "approved":
      return { text: "已批准", cls: "approved" };
    case "terminated":
      return { text: "已终止", cls: "terminated" };
    case "expired":
      return { text: "已过期", cls: "terminated" };
    case "draft":
      if (item.draftSource && item.draftSource !== "first") {
        return { text: `修回(第${item.roundNo}轮)`, cls: "modify" };
      }
      return { text: "草稿", cls: "draft" };
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

/** summaryJson 平铺为展示条目（去掉 "A1." 前缀） */
function parseSummary(raw?: string | null): [string, string][] {
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(obj).map(([k, v]) => {
      const label = k.includes(".") ? k.slice(k.indexOf(".") + 1) : k;
      return [label, Array.isArray(v) ? `[${v.length} 项]` : String(v ?? "")];
    });
  } catch {
    return [];
  }
}

export default function AupListPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [stage, setStage] = useState<AupStage | "">("");
  const [tab, setTab] = useState<"approved" | "pending">("pending");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [snapAupId, setSnapAupId] = useState<number | null>(null);
  const restoreMut = useRestoreAupDemo();
  const deleteMut = useDeleteAup();
  const unlockMut = useUnlockAup();
  const renewMut = useRenewAup();
  const isAdmin = hasMinRole(authStorage.getRole() || "", "ADMIN");
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
      stage: tab === "approved" ? ("approved" as AupStage) : stage || undefined,
      excludeStage: tab === "approved" ? undefined : ("approved" as AupStage),
      excludeDraft: true,
    }),
    [page, keyword, stage, tab]
  );

  const { data, isLoading, isError, refetch } = useAupList(params);

  const items = data?.items ?? [];
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
    if (window.confirm("确定删除该草稿计划书？删除后不可恢复。")) deleteMut.mutate(id);
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

  return (
    <div className="aup-app aup-list-fixed">
      {/* 上卡片：标题 + 阶段筛选 + 搜索 */}
      <div className="list-card list-card-top">
        <div className="page-hd" style={{ marginBottom: 14 }}>
          <div>
            <h1>计划书列表</h1>
            <div className="sub">展示计划书生成过程与各时刻快照；填写需使用已发布的模板版本</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            className={tab === "pending" ? "btn primary" : "btn ghost"}
            onClick={() => { setTab("pending"); setPage(1); }}
          >
            未通过
          </button>
          <button
            className={tab === "approved" ? "btn primary" : "btn ghost"}
            onClick={() => { setTab("approved"); setStage(""); setPage(1); }}
          >
            已通过
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ maxWidth: 260 }}
            placeholder="搜索编号 / 项目名称"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
          />
          {tab === "pending" && (
            <select
              className="select"
              style={{ maxWidth: 160 }}
              value={stage}
              onChange={(e) => {
                setStage(e.target.value as AupStage | "");
                setPage(1);
              }}
            >
              <option value="">全部未通过</option>
              <option value="draft">草稿</option>
              <option value="piReview">组长审核中</option>
              <option value="formatReview">格式审查中</option>
              <option value="expertReview">专家审查中</option>
              <option value="terminated">已终止</option>
              <option value="expired">已过期</option>
            </select>
          )}
          <button className="btn ghost" onClick={() => refetch()}>查询</button>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>共 {total} 条</span>
        </div>
      </div>

      {/* 下卡片：可滚动表格 + 分页 */}
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
          ) : (
            <table className="list-table">
              <thead>
                <tr>
                  <th>计划书编号</th>
                  <th>项目名称</th>
                  <th>提交时间</th>
                  <th>审核通过时间</th>
                  <th>阶段过程</th>
                  <th>评审意见</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const badge = stageBadge(item);
                  const open = expanded.has(item.id);
                  const isFormatAction = item.currentStage === "formatReview" && isSecretary;
                  const isExpertAction =
                    item.currentStage === "expertReview" && (item.assignedExpertCount ?? 0) > 0;
                  const reviewLabel = isFormatAction
                    ? "格式审查"
                    : isExpertAction
                      ? "内容审查"
                      : "查看";
                  const reviewPrimary = isFormatAction || isExpertAction;
                  return (
                    <TableRows
                      key={item.id}
                      item={item}
                      open={open}
                      badge={badge}
                      reviewLabel={reviewLabel}
                      reviewPrimary={reviewPrimary}
                      onToggle={() => toggle(item.id)}
                      onSnap={() => setSnapAupId(item.id)}
                      onReview={() => openReview(item.id)}
                      onRestore={item.isDemo === 1 ? () => handleRestore(item.id) : undefined}
                      onDelete={item.currentStage === "draft" && item.isDemo !== 1 ? () => handleDelete(item.id) : undefined}
                      onUnlock={
                        isAdmin &&
                        (item.currentStage === "terminated" || item.currentStage === "approved" || item.currentStage === "expired")
                          ? () => handleUnlock(item.id)
                          : undefined
                      }
                      onRenew={item.currentStage === "expired" && isAdmin ? () => handleRenew(item.id) : undefined}
                    />
                  );
                })}
              </tbody>
            </table>
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

      <SnapshotDrawer open={!!snapAupId} aupId={snapAupId != null ? String(snapAupId) : undefined} onClose={() => setSnapAupId(null)} />
    </div>
  );
}

function TableRows({
  item,
  open,
  badge,
  reviewLabel,
  reviewPrimary,
  onToggle,
  onSnap,
  onReview,
  onRestore,
  onDelete,
  onUnlock,
  onRenew,
}: {
  item: AupListItem;
  open: boolean;
  badge: { text: string; cls: string };
  reviewLabel: string;
  reviewPrimary: boolean;
  onToggle: () => void;
  onSnap: () => void;
  onReview?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  onUnlock?: () => void;
  onRenew?: () => void;
}) {
  const summary = parseSummary(item.summaryJson);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const moreItems: Array<{ label: string; onClick: () => void; danger?: boolean }> = [];
  moreItems.push({ label: `快照 (${item.snapshotCount})`, onClick: onSnap });
  if (onRestore) moreItems.push({ label: "恢复示例", onClick: onRestore });
  if (onUnlock) moreItems.push({ label: "解锁返修", onClick: onUnlock });
  if (onDelete) moreItems.push({ label: "删除", onClick: onDelete, danger: true });

  return (
    <>
      <tr className="row" onClick={onToggle}>
        <td>
          {item.registerNo ? (
            <span style={{ fontFamily: "monospace", color: "var(--primary)", fontWeight: 600 }}>{item.registerNo}</span>
          ) : (
            <span style={{ color: "var(--muted)" }}>草稿</span>
          )}
        </td>
        <td style={{ maxWidth: 300 }}>
          <div className="proj-name">
            {item.projectName || "（未命名）"}
            {item.isDemo === 1 && <span className="demo-badge">演示示例</span>}
          </div>
          <div className="proj-meta">{item.piName || "—"}{item.dept ? ` · ${item.dept}` : ""}</div>
        </td>
        <td style={{ color: "var(--muted)" }}>{formatDateTimeAsiaShanghaiShort(item.submittedAt)}</td>
        <td style={{ color: "var(--muted)" }}>{formatDateTimeAsiaShanghaiShort(item.approvedAt)}</td>
        <td><MiniStageIndicator miniSteps={item.miniSteps} /></td>
        <td>
          {item.reviewCount && item.reviewCount > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ color: "var(--primary)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>💬 {item.reviewCount} 条批注</span>
              {!!item.nonCompliantCount && item.nonCompliantCount > 0 && (
                <span className="status-badge modify">⚠ {item.nonCompliantCount} 不合规</span>
              )}
            </div>
          ) : (
            <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
          )}
        </td>
        <td><span className={"status-badge " + badge.cls}>{badge.text}</span></td>
        <td onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }} ref={menuRef}>
            {onRenew && (
              <button
                className="btn primary small"
                onClick={(e) => { e.stopPropagation(); onRenew(); }}
              >
                续期
              </button>
            )}
            {onReview && (
              <button
                className={reviewPrimary ? "btn primary small" : "btn ghost small"}
                onClick={(e) => { e.stopPropagation(); onReview(); }}
              >
                {reviewLabel}
              </button>
            )}
            {moreItems.length > 0 && (
              <>
                <button
                  className="btn ghost small"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
                  title="更多操作"
                  aria-label="更多操作"
                >
                  ⋯
                </button>
                {menuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      right: 0,
                      zIndex: 50,
                      minWidth: 150,
                      background: "#fff",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(15,23,42,.14)",
                      padding: 4,
                    }}
                  >
                    {moreItems.map((m, i) => (
                      <button
                        key={i}
                        type="button"
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontSize: 12,
                          color: m.danger ? "var(--danger)" : "var(--text)",
                          padding: "7px 10px",
                          borderRadius: 6,
                        }}
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(false); m.onClick(); }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={8}>
            <div className="detail-box">
              <div style={{ flex: 1, minWidth: 230 }}>
                <div className="k">关键信息</div>
                <div className="kv">
                  {summary.length === 0 ? (
                    <span style={{ color: "var(--muted)" }}>暂无摘要</span>
                  ) : (
                    summary.map(([k, v]) => (
                      <div key={k} className="kv-row">
                        <b>{k}：</b>
                        <span>{v}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
