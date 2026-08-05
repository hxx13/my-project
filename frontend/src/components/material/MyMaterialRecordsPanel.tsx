/**
 * 我的申领记录面板 — 嵌入物品申领商城页内的 overlay 面板
 * 仅展示个人记录（列表 + 详情），不包含统计/管理功能
 * 参照 MySuppliesRecordsPanel 模式，适配 material API + student 设计令牌
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  fetchMaterialRequestDetail,
  type MaterialRequest,
} from "@/api/domains/material.api";
import {
  useMyMaterialRequests,
  useWithdrawMaterialRequest,
  useConfirmMaterialReceive,
} from "@/api/hooks/useMaterial";
import { Portal } from "@/components/Portal";
import { Skeleton, EmptyState } from "@/features/student/components/ui";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Clock,
  Package,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿",
  PENDING: "待审核",
  FIRST_OK: "初审通过",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
  FULFILLED: "待领取",
  RECEIVED: "已完成",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-[var(--student-warning-soft)] text-[var(--student-warning)]",
  FIRST_OK: "bg-[var(--student-accent-telemetry-soft)] text-[var(--student-accent-telemetry)]",
  APPROVED: "bg-[var(--student-success-soft)] text-[var(--student-success)]",
  REJECTED: "bg-[var(--student-error-soft)] text-[var(--student-error)]",
  FULFILLED: "bg-[var(--student-primary-soft)] text-[var(--student-primary)]",
  RECEIVED: "bg-[var(--student-success-soft)] text-[var(--student-success)]",
};

const STATUS_FILTERS = [
  { label: "全部", value: undefined },
  { label: "待审核", value: "PENDING" },
  { label: "待领取", value: "FULFILLED" },
  { label: "已完成", value: "RECEIVED" },
];

function formatSpecLabel(specJson: string | undefined | null): string {
  if (!specJson) return "";
  try { return Object.values(JSON.parse(specJson)).join("·"); }
  catch { return ""; }
}

function fmtTime(iso?: string) {
  return String(iso || "").replace("T", " ").slice(0, 16);
}

/* ------------------------------------------------------------------ */
/*  Request detail sub-view                                             */
/* ------------------------------------------------------------------ */

function DetailView({
  request,
  onBack,
  onWithdraw,
  onConfirm,
}: {
  request: MaterialRequest;
  onBack: () => void;
  onWithdraw: (id: string) => void;
  onConfirm: (id: string) => void;
}) {
  const canWithdraw = request.status === "PENDING" || request.status === "FIRST_OK";
  const canConfirm = request.status === "FULFILLED";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--student-hairline)]">
        <button onClick={onBack} className="p-1 rounded hover:bg-[var(--student-canvas-soft)]">
          <ChevronLeft className="size-4 text-[var(--student-mute)]" />
        </button>
        <h3 className="text-sm font-semibold text-[var(--student-ink)]">申领详情</h3>
        <span className={cn("text-[11px] px-2 py-0.5 rounded-full ml-auto", STATUS_COLOR[request.status] || "bg-[var(--student-canvas-soft)]")}>
          {STATUS_LABEL[request.status] || request.status}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Meta */}
        <div className="text-[11px] text-[var(--student-mute)] space-y-1">
          <div>单号：<span className="font-mono text-[var(--student-ink)]">{request.id}</span></div>
          <div>提交时间：{fmtTime(request.createdAt)}</div>
          {request.fulfilledAt && <div>出库时间：{fmtTime(request.fulfilledAt)}</div>}
          {request.receivedAt && <div>领取时间：{fmtTime(request.receivedAt)}</div>}
        </div>

        {/* Lines */}
        <div className="space-y-2">
          <h4 className="text-[12px] font-semibold text-[var(--student-ink)]">申领物品</h4>
          {(request.lines || []).map((line, i) => (
            <div key={line.id || i} className="flex items-center justify-between rounded-md bg-[var(--student-canvas-soft)] px-3 py-2 text-[13px]">
              <div className="min-w-0 flex-1">
                <span className="text-[var(--student-ink)]">{line.snapshotName}</span>
                {line.specSnapshot && (
                  <span className="ml-1 text-[10px] bg-[var(--student-primary-soft)] text-[var(--student-primary)] rounded-full px-1.5 py-0.5">
                    {formatSpecLabel(line.specSnapshot)}
                  </span>
                )}
              </div>
              <span className="shrink-0 ml-3">
                <span className="font-semibold text-[var(--student-ink)]">×{line.qty}</span>
                {line.fulfilledQty > 0 && (
                  <span className="ml-1 text-[11px] text-[var(--student-success)]">(出库 {line.fulfilledQty})</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      {(canWithdraw || canConfirm) && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--student-hairline)]">
          {canWithdraw && (
            <button
              onClick={() => onWithdraw(request.id)}
              className="rounded-lg border border-[var(--student-error)] px-3 py-1.5 text-[12px] font-medium text-[var(--student-error)] hover:bg-[var(--student-error-soft)] transition-colors"
            >
              撤回申领
            </button>
          )}
          {canConfirm && (
            <button
              onClick={() => onConfirm(request.id)}
              className="rounded-lg bg-[var(--student-primary)] px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 transition-colors ml-auto"
            >
              确认领取
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main panel                                                          */
/* ------------------------------------------------------------------ */

export default function MyMaterialRecordsPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<MaterialRequest | null>(null);

  const { data, isLoading } = useMyMaterialRequests({ page, size: PAGE_SIZE, status: statusFilter });
  const withdraw = useWithdrawMaterialRequest();
  const confirm = useConfirmMaterialReceive();

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetailId(id);
    try {
      const d = await fetchMaterialRequestDetail(id);
      setDetailData(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailId(null);
    setDetailData(null);
  };

  const handleWithdraw = async (id: string) => {
    try {
      await withdraw.mutateAsync(id);
      toast.success("已撤回");
      closeDetail();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "撤回失败");
    }
  };

  const handleConfirm = async (id: string) => {
    try {
      await confirm.mutateAsync(id);
      toast.success("已确认领取");
      closeDetail();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "确认失败");
    }
  };

  const showDetail = detailId && (detailData || detailLoading);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[var(--z-modal)] flex justify-end bg-black/30"
        onClick={onClose}
      >
        <div
          className="flex h-full w-[420px] max-w-[100vw] flex-col bg-[var(--student-surface)] shadow-[-8px_0_24px_rgba(0,0,0,0.12)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-[var(--student-hairline)]">
            <h3 className="text-[15px] font-bold text-[var(--student-ink)]">我的申领记录</h3>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--student-canvas-soft)] text-[var(--student-mute)]">
              <X className="size-4" />
            </button>
          </div>

          {showDetail ? (
            detailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : detailData ? (
              <DetailView
                request={detailData}
                onBack={closeDetail}
                onWithdraw={handleWithdraw}
                onConfirm={handleConfirm}
              />
            ) : null
          ) : (
            <>
              {/* Status filter pills */}
              <div className="flex shrink-0 gap-1.5 overflow-x-auto px-4 py-2 border-b border-[var(--student-hairline)]">
                {STATUS_FILTERS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => { setStatusFilter(opt.value); setPage(1); }}
                    className={cn(
                      "px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors",
                      statusFilter === opt.value
                        ? "bg-[var(--student-primary)] text-white"
                        : "bg-[var(--student-canvas-soft)] text-[var(--student-body)] hover:bg-[var(--student-primary-soft)]",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* List */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[72px]" />)}
                  </div>
                ) : rows.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <EmptyState icon={Package} title="暂无申领记录" description="提交申领后，记录将显示在这里" />
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {rows.map((req) => (
                      <button
                        key={req.id}
                        type="button"
                        onClick={() => openDetail(req.id)}
                        className="w-full text-left rounded-lg border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] p-3 hover:border-[var(--student-primary)]/30 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-mono text-[var(--student-mute)]">{req.id}</span>
                          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", STATUS_COLOR[req.status] || "bg-[var(--student-canvas)]")}>
                            {STATUS_LABEL[req.status] || req.status}
                          </span>
                        </div>
                        <div className="text-[12px] text-[var(--student-body)] line-clamp-1">
                          {(req.lines || []).map((l, i) => (
                            <span key={i}>
                              {i > 0 && "、"}
                              {l.snapshotName}×{l.qty}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-[var(--student-mute)]">
                          <Clock className="size-3" />
                          {fmtTime(req.createdAt)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Pagination + Full page link */}
              <div className="flex shrink-0 items-center justify-between px-4 py-3 border-t border-[var(--student-hairline)]">
                <button
                  onClick={() => { onClose(); navigate("/student/material/requests"); }}
                  className="text-[11px] text-[var(--student-primary)] hover:underline"
                >
                  查看全部记录 →
                </button>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className="p-1 rounded hover:bg-[var(--student-canvas-soft)] disabled:opacity-30"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <span className="text-[11px] text-[var(--student-mute)]">{page}/{totalPages}</span>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      className="p-1 rounded hover:bg-[var(--student-canvas-soft)] disabled:opacity-30"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}
