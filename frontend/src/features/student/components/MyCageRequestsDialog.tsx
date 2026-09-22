import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, Loader2, MapPin, MoveRight, ShieldCheck, SplitSquareHorizontal } from "lucide-react";
import toast from "react-hot-toast";
import { displayPosition } from "@/features/cage-shelf/constants";
import {
  cancelCageOp, cancelClaim, confirmClaim, fetchCageOpPending, fetchMyCageOps, fetchReviewedCageOps,
  type CageClaimItem, type CageOpRequestView,
} from "@/api/domains/cageShelf.api";

/**
 * 我的申请 — 弹窗载体。
 *
 * 原来它是笼架页主区的一个 tab，和「筛选/收藏」共用同一个 grid 主区，
 * 「全房间」分支不按 tab 门控 → 那块撑满高度的空占位把申请列表顶到最下方。
 * 改成弹窗后主区只剩两种视图，且申请按单据类型分区。
 *
 * 数据源三处不同，别混：
 * - 认领 / 预约：/student/cage-claims/my（CageClaimItem，状态是 claimStatus）
 * - 分笼 / 转移：/cage-op/my（CageOpRequestView，按 opType 分流）
 * - 审核：/cage-op/pending（待我审）+ /cage-op/reviewed（我审过的）
 */

type ReqTab = "claims" | "divide" | "transfer" | "review";

const CLAIM_STATUS_LABEL: Record<string, string> = {
  pending_approval: "审批中", locked: "已锁定", confirmed: "已确认",
  pending_release_approval: "释放审批中", rejected: "已驳回", cancelled: "已取消", released: "已释放",
};
const CLAIM_STATUS_COLOR: Record<string, string> = {
  pending_approval: "text-[var(--student-warning)] bg-[var(--student-warning-soft)] border-[var(--student-warning-soft)]",
  locked: "text-[var(--student-accent-telemetry)] bg-[var(--student-accent-telemetry-soft)] border-[var(--student-accent-telemetry-soft)]",
  confirmed: "text-[var(--student-success)] bg-[var(--student-success-soft)] border-[var(--student-success-soft)]",
  pending_release_approval: "text-[var(--student-accent-alert)] bg-[var(--student-accent-alert-soft)] border-[var(--student-accent-alert-soft)]",
  rejected: "text-[var(--student-error)] bg-[var(--student-error-soft)] border-[var(--student-error-soft)]",
  cancelled: "text-[var(--student-mute)] bg-[var(--student-canvas-soft)] border-[var(--student-hairline)]",
  released: "text-[var(--student-mute)] bg-[var(--student-canvas-soft)] border-[var(--student-hairline)]",
};
const OP_STATUS_LABEL: Record<string, string> = {
  pending: "待审核", approved: "已通过", rejected: "已驳回", cancelled: "已撤销",
};

/** 位置文案：校区/房间/笼架 · 格位（格位号用屏幕口径，见 position-label 那套约定） */
function locLabel(parts: Array<string | null | undefined>, x?: number | null, y?: number | null): string {
  const base = parts.filter(Boolean).join(" / ");
  const pos = x != null && y != null ? displayPosition(`${x}-${y}`) : "";
  return [base, pos].filter(Boolean).join(" · ");
}

export default function MyCageRequestsDialog({
  open,
  onClose,
  claims,
  claimsLoading,
  onReloadClaims,
  onCageDataChanged,
}: {
  open: boolean;
  onClose: () => void;
  claims: CageClaimItem[];
  claimsLoading: boolean;
  onReloadClaims: () => void;
  /** 撤销分笼/转移后让网格上的「审核中」标记一起刷新 */
  onCageDataChanged: () => void;
}) {
  const [tab, setTab] = useState<ReqTab>("claims");
  const [ops, setOps] = useState<CageOpRequestView[]>([]);
  const [opsLoading, setOpsLoading] = useState(false);
  const [pendingOps, setPendingOps] = useState<CageOpRequestView[]>([]);
  const [reviewedOps, setReviewedOps] = useState<CageOpRequestView[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOpsLoading(true);
    fetchMyCageOps().then(setOps).catch(() => setOps([])).finally(() => setOpsLoading(false));
    setReviewLoading(true);
    Promise.all([fetchCageOpPending(), fetchReviewedCageOps(50)])
      .then(([p, r]) => { setPendingOps(p || []); setReviewedOps(r || []); })
      .catch(() => { setPendingOps([]); setReviewedOps([]); })
      .finally(() => setReviewLoading(false));
  }, [open, reloadKey]);

  const claimGroups = useMemo(() => {
    const m = new Map<string, CageClaimItem[]>();
    for (const c of claims) {
      const key = [c.campusName, c.roomName].filter(Boolean).join(" / ") || "未指定房间";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return Array.from(m.entries());
  }, [claims]);

  if (!open) return null;

  const divideOps = ops.filter((o) => o.opType === "divide");
  const transferOps = ops.filter((o) => o.opType === "transfer");
  const reviewItems = [...pendingOps, ...reviewedOps];
  const tabs: Array<{ key: ReqTab; label: string; count: number }> = [
    { key: "claims", label: "认领申请", count: claims.length },
    { key: "divide", label: "分笼申请", count: divideOps.length },
    { key: "transfer", label: "转移申请", count: transferOps.length },
    ...(reviewLoading || reviewItems.length > 0 ? [{ key: "review" as ReqTab, label: "审核申请", count: reviewItems.length }] : []),
  ];
  const activeTab = tabs.some((t) => t.key === tab) ? tab : "claims";

  const withBusy = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(ok);
      setReloadKey((k) => k + 1);
      onCageDataChanged();
    } catch (e: any) {
      toast.error(e?.message || "操作失败");
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (label: string, cls: string) => (
    <span className={`inline-flex items-center shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${cls}`}>{label}</span>
  );
  const cardCls = "rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2";

  const opTone = (status: string) => status === "pending"
    ? "text-[var(--student-warning)] bg-[var(--student-warning-soft)] border-[var(--student-warning-soft)]"
    : status === "approved"
      ? "text-[var(--student-success)] bg-[var(--student-success-soft)] border-[var(--student-success-soft)]"
      : status === "rejected"
        ? "text-[var(--student-error)] bg-[var(--student-error-soft)] border-[var(--student-error-soft)]"
        : "text-[var(--student-mute)] bg-[var(--student-canvas-soft)] border-[var(--student-hairline)]";

  const opCard = (o: CageOpRequestView) => {
    const label = OP_STATUS_LABEL[o.status] || o.status;
    const tone = opTone(o.status);
    const targets = (o.targets ?? []).filter((t) => t.animalCageId);
    return (
      <div key={o.id} className={cardCls}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {o.opType === "divide"
                ? <SplitSquareHorizontal className="h-3 w-3 shrink-0 text-[var(--app-color-text-tertiary)]" />
                : <MoveRight className="h-3 w-3 shrink-0 text-[var(--app-color-text-tertiary)]" />}
              <span className="text-[12px] font-semibold truncate text-[var(--app-color-text-primary)]">
                {locLabel([o.campusName, o.roomName, o.shelveName], o.positionX, o.positionY) || `笼位 #${o.sourceAnimalCageId}`}
              </span>
              {statusBadge(label, tone)}
            </div>
            {targets.length > 0 && (
              <div className="mt-1 text-[10px] leading-snug text-[var(--app-color-text-tertiary)]">
                → {targets.map((t) => locLabel([t.roomName, t.shelveName], t.positionX, t.positionY) || `笼位 #${t.animalCageId}`).join("、")}
              </div>
            )}
            <div className="mt-0.5 text-[10px] truncate text-[var(--app-color-text-tertiary)]">
              申请时间：{o.createdAt?.substring(0, 16)?.replace("T", " ")}
              {o.rejectReason ? <span className="text-[var(--student-error)]"> · {o.rejectReason}</span> : null}
            </div>
          </div>
          {o.status === "pending" && (
            <button type="button" disabled={busyId === o.id}
              onClick={() => void withBusy(o.id, () => cancelCageOp(o.id), "已撤销")}
              className="shrink-0 rounded-student-sm px-2 py-1 text-[10px] font-semibold border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50">
              撤销
            </button>
          )}
        </div>
      </div>
    );
  };

  const empty = (text: string) => (
    <div className="rounded-student-lg border border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] flex flex-col items-center justify-center py-12 text-center text-sm text-[var(--app-color-text-tertiary)]">
      <ClipboardList className="h-8 w-8 mb-2 opacity-20" />
      {text}
    </div>
  );
  const loading = (
    <div className="flex items-center justify-center py-12 text-sm text-[var(--app-color-text-tertiary)]">
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />加载中…
    </div>
  );

  const body = () => {
    if (activeTab === "claims") {
      if (claimsLoading) return loading;
      if (claims.length === 0) return empty("暂无认领申请");
      return (
        <div className="space-y-3">
          {claimGroups.map(([room, items]) => (
            <div key={room}>
              <div className="flex items-center gap-1.5 px-1 pb-1.5">
                <MapPin className="h-3 w-3 text-[var(--app-color-text-tertiary)]" />
                <span className="text-[11px] font-semibold text-[var(--app-color-text-tertiary)]">{room}</span>
                <span className="text-[10px] text-[color-mix(in_srgb,var(--app-color-text-tertiary)_60%,transparent)]">{items.length}</span>
              </div>
              <div className="space-y-1.5">
                {items.map((c) => (
                  <div key={c.id} className={`${cardCls} flex items-center gap-2`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold truncate text-[var(--app-color-text-primary)]">
                          {[c.shelveName, c.positionX != null && c.positionY != null ? displayPosition(`${c.positionX}-${c.positionY}`) : ""].filter(Boolean).join(" · ") || `笼位 #${c.animalCageId}`}
                        </span>
                        {statusBadge(CLAIM_STATUS_LABEL[c.claimStatus] || c.claimStatus, CLAIM_STATUS_COLOR[c.claimStatus] || "text-[var(--app-color-text-tertiary)] bg-[var(--student-canvas-soft)] border-[var(--app-color-border-default)]")}
                      </div>
                      <div className="text-[10px] truncate text-[var(--app-color-text-tertiary)]">
                        申请时间：{c.createdAt?.substring(0, 16)?.replace("T", " ")}
                        {c.claimStatus === "rejected" && c.latestRejectReason ? <span className="text-[var(--student-error)]"> · 驳回：{c.latestRejectReason}</span> : null}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      {/* 学生仅在审核完毕前可取消；审核通过后不再提供取消/释放，释放由教职工发起 */}
                      {c.claimStatus === "pending_approval" && (
                        <button type="button" disabled={busyId === String(c.id)}
                          onClick={() => void withBusy(String(c.id), async () => { await cancelClaim(c.id); onReloadClaims(); }, "已取消")}
                          className="rounded-student-sm px-2 py-1 text-[10px] font-semibold border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50">取消</button>
                      )}
                      {c.claimStatus === "locked" && (
                        <button type="button" disabled={busyId === String(c.id)}
                          onClick={() => void withBusy(String(c.id), async () => { await confirmClaim(c.id); onReloadClaims(); }, "已确认到位")}
                          className="rounded-student-sm px-2 py-1 text-[10px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">确认到位</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (activeTab === "review") {
      if (reviewLoading) return loading;
      const pendingIds = new Set(pendingOps.map((o) => o.id));
      const items = [...pendingOps, ...reviewedOps.filter((o) => !pendingIds.has(o.id))];
      if (items.length === 0) return empty("暂无待我审核 / 我审过的申请");
      return (
        <div className="space-y-1.5">
          <div className="px-1 pb-1 text-[10px] text-[var(--app-color-text-tertiary)]">
            共 {items.length} 条（待审 {pendingOps.length} · 已审 {reviewedOps.length}）
          </div>
          {items.map((o) => (
            <div key={o.id} className={cardCls}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <ShieldCheck className="h-3 w-3 shrink-0 text-[var(--app-color-text-tertiary)]" />
                <span className="text-[11px] font-semibold text-[var(--app-color-text-tertiary)]">{o.applicantName || "—"}</span>
                <span className="text-[12px] font-semibold truncate text-[var(--app-color-text-primary)]">
                  {o.opType === "divide" ? "分笼" : "转移"} · {locLabel([o.roomName, o.shelveName], o.positionX, o.positionY) || `笼位 #${o.sourceAnimalCageId}`}
                </span>
                {statusBadge(OP_STATUS_LABEL[o.status] || o.status, opTone(o.status))}
              </div>
              <div className="mt-0.5 text-[10px] truncate text-[var(--app-color-text-tertiary)]">
                申请时间：{o.createdAt?.substring(0, 16)?.replace("T", " ")}
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (opsLoading) return loading;
    const list = activeTab === "divide" ? divideOps : transferOps;
    if (list.length === 0) return empty(activeTab === "divide" ? "暂无分笼申请" : "暂无转移申请");
    return <div className="space-y-1.5">{list.map(opCard)}</div>;
  };

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-student-lg bg-[var(--app-color-surface-container)] p-4 shadow-[var(--student-shadow-modal)]"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between shrink-0">
          <div className="text-sm font-semibold text-[var(--app-color-text-primary)]">我的申请</div>
          <button className="text-xs text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]" onClick={onClose}>关闭</button>
        </div>
        <div className="shrink-0 flex items-center gap-1 rounded-student-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1 mb-3">
          {tabs.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`flex items-center gap-1 rounded-student-sm px-2.5 py-1 text-[11px] font-semibold transition ${activeTab === t.key ? "bg-[var(--app-color-accent-hover)] text-white shadow-sm" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"}`}>
              {t.label}
              {t.count > 0 && <span className={activeTab === t.key ? "text-white/80" : "opacity-70"}>{t.count}</span>}
            </button>
          ))}
        </div>
        <div className="cage-scroll flex-1 min-h-0 overflow-y-auto">{body()}</div>
      </div>
    </div>,
    document.body,
  );
}
