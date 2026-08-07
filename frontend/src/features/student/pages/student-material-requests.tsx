/**
 * 我的申领 — 内嵌于申领物品页的子视图
 * 文件夹式收纳：待完成 / 已完成（参考 MaterialReviewPage TimeGroup 模式）
 */
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Package, Clock, ChevronDown, ChevronRight as ChevronRightIcon } from "lucide-react";
import { useMyMaterialRequests, useWithdrawMaterialRequest } from "@/api/hooks/useMaterial";
import type { MaterialRequest } from "@/api/domains/material.api";
import { StudentCard, Skeleton, EmptyState } from "../components/ui";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 30;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿", PENDING: "待审核", FIRST_OK: "初审通过",
  APPROVED: "已通过", REJECTED: "已拒绝", FULFILLED: "待领取", RECEIVED: "已完成",
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-[var(--student-warning-soft)] text-[var(--student-warning)]",
  FIRST_OK: "bg-[var(--student-accent-telemetry-soft)] text-[var(--student-accent-telemetry)]",
  APPROVED: "bg-[var(--student-success-soft)] text-[var(--student-success)]",
  REJECTED: "bg-[var(--student-error-soft)] text-[var(--student-error)]",
  FULFILLED: "bg-[var(--student-primary-soft)] text-[var(--student-primary)]",
  RECEIVED: "bg-[var(--student-success-soft)] text-[var(--student-success)]",
};

/** 待完成：审核中 */
const ACTIVE_STATUSES = new Set(["PENDING", "FIRST_OK"]);
/** 已完成：已办结（审核通过/待领取/已领取/已拒绝） */
const DONE_STATUSES = new Set(["APPROVED", "FULFILLED", "RECEIVED", "REJECTED"]);

function formatSpecLabel(specJson: string | undefined | null): string {
  if (!specJson) return "";
  try { return Object.values(JSON.parse(specJson)).join("·"); }
  catch { return ""; }
}

function fmtTime(iso?: string) {
  return String(iso || "").replace("T", " ").slice(0, 16);
}

/* ------------------------------------------------------------------ */
/*  Folder (collapsible group, ref MaterialReviewPage TimeGroup)        */
/* ------------------------------------------------------------------ */

function Folder({ label, count, defaultOpen = true, children }: { label: string; count: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--student-ink)] hover:text-[var(--student-primary)] transition-colors">
        <span className={cn("transition-transform text-[var(--student-mute)]", open && "rotate-90")}>▶</span>
        {label}
        <span className="text-[12px] font-normal text-[var(--student-mute)]">({count})</span>
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Request card                                                        */
/* ------------------------------------------------------------------ */

function RequestCard({ req, onWithdraw }: { req: MaterialRequest; onWithdraw: (id: string) => void }) {
  const canWithdraw = req.status === "PENDING" || req.status === "FIRST_OK";

  return (
    <StudentCard className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--student-mute)] font-mono">{req.id}</span>
        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", STATUS_COLOR[req.status] || "bg-[var(--student-canvas-soft)] text-[var(--student-mute)]")}>
          {STATUS_LABEL[req.status] || req.status}
        </span>
      </div>
      <div className="text-[12px] space-y-0.5">
        {(req.lines || []).map((l, i) => (
          <p key={i} className="text-[var(--student-body)]">
            {l.snapshotName}
            {l.specSnapshot && (
              <span className="ml-1 text-[10px] bg-[var(--student-primary-soft)] text-[var(--student-primary)] rounded-full px-1.5 py-0.5">
                {formatSpecLabel(l.specSnapshot)}
              </span>
            )}
            {" "}×{l.qty}
            {l.fulfilledQty > 0 && <span className="text-[var(--student-success)] ml-1">(出库 {l.fulfilledQty})</span>}
          </p>
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-[var(--student-mute)]">
        <span className="flex items-center gap-1"><Clock className="size-3" />{fmtTime(req.createdAt)}</span>
        {canWithdraw && <button onClick={() => onWithdraw(req.id)} className="text-[var(--student-error)] hover:underline font-medium">撤回</button>}
      </div>
    </StudentCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Main view                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  onBack: () => void;
}

export default function StudentMaterialRequestsView({ onBack }: Props) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMyMaterialRequests({ page, size: PAGE_SIZE });
  const withdraw = useWithdrawMaterialRequest();

  const all = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { active, done } = useMemo(() => {
    const a: MaterialRequest[] = [];
    const d: MaterialRequest[] = [];
    for (const r of all) {
      if (ACTIVE_STATUSES.has(r.status)) a.push(r);
      else if (DONE_STATUSES.has(r.status)) d.push(r);
    }
    return { active: a, done: d };
  }, [all]);

  const handleWithdraw = async (id: string) => { try { await withdraw.mutateAsync(id); } catch { /* toast handled by hook */ } };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 px-4 py-3 border-b border-[var(--student-hairline)] bg-[var(--student-surface)]">
        <button onClick={onBack} className="flex items-center gap-1 text-[13px] text-[var(--student-mute)] hover:text-[var(--student-ink)] shrink-0">
          <ChevronLeft className="size-4" /> 返回商城
        </button>
        <h2 className="text-[15px] font-semibold text-[var(--student-ink)]">我的申领</h2>
        <span className="text-[12px] text-[var(--student-mute)] ml-auto">共 {total} 条</span>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[80px]" />)
        ) : all.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState icon={Package} title="暂无申领记录" description="提交申领后，记录将显示在这里" />
          </div>
        ) : (
          <>
            {/* 待完成 */}
            <Folder label="待完成" count={active.length} defaultOpen={true}>
              {active.length === 0 ? (
                <p className="text-[12px] text-[var(--student-mute)] py-4 text-center">暂无进行中的申领</p>
              ) : (
                active.map(r => <RequestCard key={r.id} req={r} onWithdraw={handleWithdraw} />)
              )}
            </Folder>

            {/* 已完成 */}
            <Folder label="已完成" count={done.length} defaultOpen={false}>
              {done.length === 0 ? (
                <p className="text-[12px] text-[var(--student-mute)] py-4 text-center">暂无已完成的申领</p>
              ) : (
                done.map(r => <RequestCard key={r.id} req={r} onWithdraw={handleWithdraw} />)
              )}
            </Folder>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1 text-[12px] rounded border border-[var(--student-hairline)] disabled:opacity-30">上一页</button>
            <span className="text-[12px] text-[var(--student-mute)]">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-3 py-1 text-[12px] rounded border border-[var(--student-hairline)] disabled:opacity-30">下一页</button>
          </div>
        )}
      </div>
    </div>
  );
}
