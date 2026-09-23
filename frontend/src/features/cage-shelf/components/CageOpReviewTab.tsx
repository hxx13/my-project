import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { adminInputClass } from "@/features/admin/adminFormUi";
import { authStorage } from "@/features/auth/authStorage";
import { formatBeijingDateTimeFull } from "@/utils/beijingTime";
import { cagePositionLabel } from "@/utils/cageClaimReviewDisplay";
import {
  fetchTransferFormPdf,
  fetchTransferFormsMerged,
  type CageOpRequestView,
} from "@/api/domains/cageShelf.api";
import { PdfPreviewDialog } from "@/components/common/PdfPreviewDialog";
import { PrintDispatchDialog } from "@/features/print-station/PrintDispatchDialog";
import DataSkeleton from "@/components/ui/DataSkeleton";
import {
  CAGE_OP_STATUS_FILTER_OPTIONS,
  filterCageOpRows,
  selectedIdsInOrder,
  signatureProgressText,
  type CageOpStatusFilter,
} from "../cageOpReviewFilter";

/**
 * 分笼 / 转移审核 tab。
 *
 * 结构照 AdminOrderReviewPage：待审核/已审核 + 卡片/表格 两组 .review-tabs 子切换，
 * 表格用 .twin-table（吸顶表头 + 横向滚动）。原先「待审核/已审核」两块折叠分区被子 tab 取代。
 * 转移单 PDF「查看/合并打印」复用 PdfPreviewDialog；打印仍走卡片上的 PrintDispatchDialog。
 */

/** 后端合并转移单的单次上限；前端先拦，免得白跑一次请求。 */
const MERGE_LIMIT = 50;

const CAGE_OP_STATUS_LABEL: Record<string, string> = {
  pending: "待审核", approved: "已通过", rejected: "已驳回", cancelled: "已撤销",
};
const CAGE_OP_STATUS_TONE: Record<string, string> = {
  pending: "pending", approved: "ok", rejected: "bad", cancelled: "none",
};

/** 转移三签的三方，顺序固定 = 卡片上从左到右 */
export const CAGE_OP_SIGN_SLOTS: Array<{ role: "ORIGIN" | "DEST" | "VET"; label: string }> = [
  { role: "ORIGIN", label: "归属地" },
  { role: "DEST", label: "目的地" },
  { role: "VET", label: "兽医" },
];
/** 签署动作 → 卡片文案。暂缓不终局（还能再签），所以跟不同意分开两档。 */
const CAGE_OP_DECISION_LABEL: Record<"approved" | "held" | "rejected", string> = {
  approved: "已通过", held: "暂缓", rejected: "不同意",
};
const CAGE_OP_DECISION_TONE: Record<"approved" | "held" | "rejected", string> = {
  approved: "ok", held: "pending", rejected: "bad",
};

type JumpLoc = { shelveId?: string | number | null; positionX?: number | null; positionY?: number | null };
type SignDecision = "approved" | "held" | "rejected";
type SubTab = "pending" | "done";
type ViewMode = "card" | "table";

/** PDF 预览的待打开文档：点「查看转移单」/「合并打印」时构造，关掉即丢弃。 */
interface PdfPreviewState {
  title: string;
  fileName: string;
  fetchPdf: () => Promise<Blob>;
}

export function CageOpReviewTab({
  opType,
  pending,
  done,
  loading,
  actionPending,
  onApprove,
  onReject,
  onSign,
  onJump,
}: {
  opType: "divide" | "transfer";
  pending: CageOpRequestView[];
  done: CageOpRequestView[];
  loading: boolean;
  actionPending?: boolean;
  onApprove: (r: CageOpRequestView) => void;
  onReject: (r: CageOpRequestView) => void;
  onSign: (r: CageOpRequestView, role: string, decision: SignDecision) => void;
  onJump: (loc: JumpLoc) => void;
}) {
  const [sub, setSub] = useState<SubTab>("pending");
  const [view, setView] = useState<ViewMode>("card");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<CageOpStatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);

  const rows = sub === "pending" ? pending : done;
  const filtered = useMemo(
    () => filterCageOpRows(rows, { keyword, status: statusFilter }),
    [rows, keyword, statusFilter],
  );

  /** 只有转移单能勾选/合印；分笼单没有 PDF。 */
  const canSelect = opType === "transfer";
  const selectedIds = useMemo(() => (canSelect ? selectedIdsInOrder(filtered, selected) : []), [canSelect, filtered, selected]);
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someSelected = !allSelected && filtered.some((r) => selected.has(r.id));

  /** 切子 tab 时清空选中与筛选，免得上一个分区的勾选/关键词串到另一个分区。 */
  const switchSub = (next: SubTab) => {
    setSub(next);
    setKeyword("");
    setStatusFilter("all");
    setSelected(new Set());
  };

  const toggleOne = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  /** 表头全选：只作用于当前筛选结果。 */
  const toggleAll = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      const ids = filtered.map((r) => r.id);
      const all = ids.length > 0 && ids.every((id) => n.has(id));
      ids.forEach((id) => (all ? n.delete(id) : n.add(id)));
      return n;
    });

  const openMergedPrint = () => {
    if (selectedIds.length === 0) return;
    if (selectedIds.length > MERGE_LIMIT) {
      toast.error(`一次最多合并打印 ${MERGE_LIMIT} 张转移单，当前已选 ${selectedIds.length} 张`);
      return;
    }
    const ids = [...selectedIds];
    setPdfPreview({
      title: `合并转移单（${ids.length} 张）`,
      fileName: `转移单-合并-${ids.length}张.pdf`,
      fetchPdf: () => fetchTransferFormsMerged(ids),
    });
  };

  const openSinglePdf = (r: CageOpRequestView) =>
    setPdfPreview({
      title: `转移单 · ${r.applicantName || r.applicantId || ""}`,
      fileName: `转移单-${r.id}.pdf`,
      fetchPdf: () => fetchTransferFormPdf(r.id),
    });

  const emptyText = sub === "pending"
    ? `暂无可审批的${opType === "divide" ? "分笼" : "转移"}`
    : `暂无已审核的${opType === "divide" ? "分笼" : "转移"}记录`;

  return (
    <div className="space-y-4">
      {/* 工具栏：待审/已审 + 卡片/表格 两组子切换。照 AdminOrderReviewPage 的写法。 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="review-tabs shrink-0">
          {([["pending", "待审核"], ["done", "已审核"]] as [SubTab, string][]).map(([k, v]) => (
            <button key={k} type="button" onClick={() => switchSub(k)} className="review-tab" data-active={sub === k}>
              {v}
            </button>
          ))}
        </div>
        <div className="mx-1 h-4 w-px shrink-0 bg-[var(--app-color-border-default)]" />
        <div className="review-tabs shrink-0">
          {([["card", "卡片"], ["table", "表格"]] as [ViewMode, string][]).map(([k, v]) => (
            <button key={k} type="button" onClick={() => setView(k)} className="review-tab" data-active={view === k}>
              {v}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1" />
        <span className="shrink-0 text-xs text-[var(--app-color-text-tertiary)]">共 {filtered.length} 条</span>
      </div>

      {/* 筛选：关键词 + 状态 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={cn(adminInputClass, "h-8 w-full max-w-[18rem] text-xs")}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索申请人 / 原因 / 校区·房间·笼架 / 坐标"
        />
        <select
          className={cn(adminInputClass, "h-8 w-[8rem] text-xs")}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CageOpStatusFilter)}
        >
          {CAGE_OP_STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 批量打印条：只有转移单才出现 */}
      {canSelect && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[var(--app-color-text-secondary)]">已选 {selectedIds.length} 张</span>
          <button
            type="button"
            onClick={openMergedPrint}
            disabled={selectedIds.length === 0}
            className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50"
          >
            合并打印
          </button>
          <span className="text-[var(--app-color-text-tertiary)]">
            逐条下载：在「操作」列点「查看转移单」；一次最多 {MERGE_LIMIT} 张
          </span>
        </div>
      )}

      {loading ? (
        <DataSkeleton variant="card" rows={5} />
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--twin-mute)]">{emptyText}</p>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--twin-mute)]">没有符合筛选条件的记录</p>
      ) : view === "table" ? (
        <CageOpTable
          rows={filtered}
          opType={opType}
          canSelect={canSelect}
          selected={selected}
          allSelected={allSelected}
          someSelected={someSelected}
          onToggleOne={toggleOne}
          onToggleAll={toggleAll}
          onJump={onJump}
          onViewPdf={openSinglePdf}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((r) => (
            <CageOpReviewCard
              key={r.id}
              req={r}
              onApprove={onApprove}
              onReject={onReject}
              onSign={onSign}
              actionPending={actionPending}
              readOnly={sub === "done"}
              onJump={onJump}
            />
          ))}
        </div>
      )}

      {pdfPreview && (
        <PdfPreviewDialog
          title={pdfPreview.title}
          fileName={pdfPreview.fileName}
          fetchPdf={pdfPreview.fetchPdf}
          onClose={() => setPdfPreview(null)}
        />
      )}
    </div>
  );
}

/* ════════════ 表格视图 ════════════ */

/**
 * 表格视图：一行一单。
 *
 * 签署/审批动作留在卡片视图 —— 表格里要塞下「归属地/目的地/兽医 × 通过/暂缓/驳回」会撑爆行高，
 * 且这三种决策的按钮语义在不同角色下不同。操作列只给「查看转移单」（转移单）与「定位」。
 */
function CageOpTable({
  rows, opType, canSelect, selected, allSelected, someSelected, onToggleOne, onToggleAll, onJump, onViewPdf,
}: {
  rows: CageOpRequestView[];
  opType: "divide" | "transfer";
  canSelect: boolean;
  selected: ReadonlySet<string>;
  allSelected: boolean;
  someSelected: boolean;
  onToggleOne: (id: string) => void;
  onToggleAll: () => void;
  onJump: (loc: JumpLoc) => void;
  onViewPdf: (r: CageOpRequestView) => void;
}) {
  const th = "px-3 py-2 whitespace-nowrap";
  const td = "px-3 py-2 align-top";
  const isTransfer = opType === "transfer";
  const linkBtn = "text-[11px] text-[var(--app-color-accent)] hover:underline shrink-0";
  const checkBox = "size-3.5 cursor-pointer accent-[var(--app-color-accent)]";

  return (
    <div className="max-h-[70vh] overflow-auto rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">
      <table className="twin-table w-max min-w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            {canSelect && (
              <th className={cn(th, "w-10")}>
                <input
                  type="checkbox"
                  className={checkBox}
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={onToggleAll}
                  aria-label="全选当前筛选结果"
                />
              </th>
            )}
            <th className={cn(th, "min-w-[110px]")}>申请人</th>
            <th className={cn(th, "min-w-[220px]")}>源笼位</th>
            <th className={cn(th, "min-w-[220px]")}>目标笼位</th>
            {isTransfer && <th className={cn(th, "min-w-[260px]")}>三签进度</th>}
            <th className={cn(th, "min-w-[90px]")}>状态</th>
            <th className={cn(th, "min-w-[150px]")}>申请时间</th>
            <th className={cn(th, "min-w-[130px] text-right")}>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const srcPos = cagePositionLabel(r.positionX, r.positionY);
            const srcLoc = [r.campusName, r.roomName, r.shelveName].filter(Boolean).join(" / ");
            const targets = r.targets ?? [];
            const canJump = r.shelveId != null && !!srcPos;
            return (
              <tr key={r.id} className="border-b border-[var(--twin-hairline)]">
                {canSelect && (
                  <td className={td}>
                    <input
                      type="checkbox"
                      className={checkBox}
                      checked={selected.has(r.id)}
                      onChange={() => onToggleOne(r.id)}
                      aria-label={`选择 ${r.applicantName || r.id}`}
                    />
                  </td>
                )}
                <td className={cn(td, "font-medium text-[var(--app-color-text-primary)]")}>
                  {r.applicantName || r.applicantId || "—"}
                </td>
                <td className={cn(td, "max-w-[280px] whitespace-normal break-words")}>
                  {/* 只给「校区 / 房间 / 架子」：shelveName 自带位号，再缀一串「坐标 X-Y」是重复信息 */}
                  {srcLoc || "—"}
                </td>
                <td className={cn(td, "max-w-[280px] whitespace-normal break-words")}>
                  {targets.length === 0
                    ? (isTransfer ? "—" : `共 ${r.targetAnimalCageIds.length} 个笼位`)
                    : targets.map((t) => {
                        // 同源笼位：只给「校区 / 房间 / 架子」，不再缀「坐标 X-Y」
                        return [t.campusName, t.roomName, t.shelveName].filter(Boolean).join(" / ");
                      }).join("；")}
                </td>
                {isTransfer && (
                  <td className={cn(td, "text-xs text-[var(--app-color-text-secondary)]")}>
                    {signatureProgressText(r)}
                  </td>
                )}
                <td className={td}>
                  <span className="review-status" data-tone={CAGE_OP_STATUS_TONE[r.status] ?? "none"}>
                    {CAGE_OP_STATUS_LABEL[r.status] || r.status}
                  </span>
                </td>
                <td className={cn(td, "text-xs tabular-nums text-[var(--app-color-text-tertiary)]")}>
                  {r.createdAt ? formatBeijingDateTimeFull(r.createdAt) : "—"}
                </td>
                <td className={cn(td, "text-right")}>
                  <div className="flex items-center justify-end gap-2">
                    {canJump && (
                      <button
                        type="button"
                        onClick={() => onJump({ shelveId: r.shelveId, positionX: r.positionX, positionY: r.positionY })}
                        className={linkBtn}
                      >
                        定位
                      </button>
                    )}
                    {isTransfer ? (
                      <button type="button" onClick={() => onViewPdf(r)} className={linkBtn}>查看转移单</button>
                    ) : (
                      !canJump && <span className="text-xs text-[var(--twin-mute)]">—</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════ 卡片视图 ════════════ */

/** 分笼 / 转移审核卡片；readOnly = 已审核区（只展示结果，不再给操作） */
function CageOpReviewCard({
  req,
  onApprove,
  onReject,
  onSign,
  actionPending,
  readOnly,
  onJump,
}: {
  req: CageOpRequestView;
  onApprove?: (r: CageOpRequestView) => void;
  onReject?: (r: CageOpRequestView) => void;
  /** 转移三签：按角色签署（点哪个角色签哪一关）。分笼单不传。 */
  onSign?: (r: CageOpRequestView, role: string, decision: SignDecision) => void;
  actionPending?: boolean;
  readOnly?: boolean;
  onJump?: (loc: JumpLoc) => void;
}) {
  const isDivide = req.opType === "divide";
  const srcPos = cagePositionLabel(req.positionX, req.positionY);
  const loc = [req.campusName, req.roomName, req.shelveName].filter(Boolean).join(" / ");
  const targets = req.targets ?? [];
  const jumpBtn = "text-[11px] text-[var(--app-color-accent)] hover:underline shrink-0";
  const tone = readOnly ? (req.status === "approved" ? "ok" : req.status === "rejected" ? "bad" : "none") : "pending";
  /** 已审核区：本人签署的那一关标「我」，用自己的签名时间，而不是单据最后的 reviewerName/reviewedAt。 */
  const myId = readOnly ? authStorage.getUserId() : null;

  /* 转移单 PDF：预览与打印共用同一个取流函数，只是打印要先落到本地文件再交给派发弹窗 */
  const [formOpen, setFormOpen] = useState(false);
  const [printFile, setPrintFile] = useState<File | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const handlePrint = async () => {
    setPrintBusy(true);
    try {
      const blob = await fetchTransferFormPdf(req.id);
      setPrintFile(new File([blob], `转移单-${req.id}.pdf`, { type: "application/pdf" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载转移单失败");
    } finally {
      setPrintBusy(false);
    }
  };

  return (
    <div className="review-card p-3" data-tone={tone}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">{req.applicantName || req.applicantId || "—"}</span>
            <span className="review-status">{CAGE_OP_STATUS_LABEL[req.status] || req.status}</span>
          </div>
          {/* 只给坐标，不给笼位 id —— 审的人要判断的是「从哪搬到哪」，id 没有信息量 */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--app-color-text-tertiary)]">
            <span className="font-medium text-[var(--app-color-text-secondary)]">{isDivide ? "分笼" : "转移"}</span>
            <span>源：{loc}{loc && srcPos ? " · " : ""}{srcPos && `坐标 ${srcPos}`}</span>
            {req.shelveId != null && srcPos && (
              <button type="button" onClick={() => onJump?.({ shelveId: req.shelveId, positionX: req.positionX, positionY: req.positionY })} className={jumpBtn}>定位</button>
            )}
          </div>
          <div className="space-y-0.5 text-[11px] text-[var(--app-color-text-secondary)]">
            {targets.length === 0 ? (
              <div className="text-[var(--app-color-text-tertiary)]">{isDivide ? `目标 ${req.targetAnimalCageIds.length} 个笼位（无定位信息）` : "目标笼位：—"}</div>
            ) : targets.map((t) => {
              const tWhere = [t.campusName, t.roomName, t.shelveName].filter(Boolean).join(" / ");
              const tPos = cagePositionLabel(t.positionX, t.positionY);
              return (
                <div key={t.animalCageId} className="flex flex-wrap items-center gap-2">
                  <span>→ {tWhere}{tWhere && tPos ? " · " : ""}{tPos && `坐标 ${tPos}`}</span>
                  {t.shelveId != null && tPos && (
                    <button type="button" onClick={() => onJump?.({ shelveId: t.shelveId, positionX: t.positionX, positionY: t.positionY })} className={jumpBtn}>定位</button>
                  )}
                </div>
              );
            })}
          </div>
          {req.reason && <div className="text-[11px] text-[var(--app-color-text-tertiary)]">理由：{req.reason}</div>}
          {readOnly && req.rejectReason && <div className="text-[11px] text-[var(--app-color-feedback-danger)]">驳回理由：{req.rejectReason}</div>}
          {/* 三签进度：只认 signatures 里有没有该角色的记录 —— missingRoles 分不出「暂缓」和「还没签」。
              分笼单没有三签（signatures 是空数组），整块不渲染。 */}
          {!isDivide && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                {CAGE_OP_SIGN_SLOTS.map(({ role, label }) => {
                  const sign = req.signatures?.find((s) => s.role === role);
                  const mine = readOnly && !!myId && sign?.reviewerId === myId;
                  const decision = sign?.decision;
                  const detail = !decision ? ""
                    : decision === "approved"
                      ? [mine ? "" : sign?.reviewerName, sign?.at ? formatBeijingDateTimeFull(sign.at) : ""].filter(Boolean).join(" · ")
                      : sign?.reason || "";
                  return (
                    <span key={role} className="inline-flex items-center gap-1.5">
                      <span className="review-status" data-tone={decision ? CAGE_OP_DECISION_TONE[decision] : "none"}>
                        {label} · {mine ? "我 · " : ""}{decision ? CAGE_OP_DECISION_LABEL[decision] : "待签"}
                      </span>
                      {detail && <span className="text-[11px] text-[var(--app-color-text-tertiary)]">{detail}</span>}
                    </span>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-0.5">
                <button type="button" onClick={() => setFormOpen(true)} className={jumpBtn}>查看转移单</button>
                <button type="button" onClick={handlePrint} disabled={printBusy} className={`${jumpBtn} disabled:opacity-50`}>
                  {printBusy ? "准备中…" : "打印转移单"}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-[11px] tabular-nums text-[var(--app-color-text-tertiary)]">{req.createdAt ? formatBeijingDateTimeFull(req.createdAt) : "—"}</span>
          {readOnly ? (
            req.reviewedAt ? (
              <span className="text-[11px] tabular-nums text-[var(--app-color-text-tertiary)]">
                处理 {formatBeijingDateTimeFull(req.reviewedAt)}
                {req.reviewerName && <span className="text-[var(--app-color-text-secondary)]"> · {req.reviewerName}</span>}
              </span>
            ) : null
          ) : isDivide || req.threeSign === false ? (
            /* 分笼与**存量转移单**都走旧的单签链：一次通过即执行，只给 通过/驳回。
               存量单画三个角色按钮会让点「归属地」把整笔转移执行掉（实测踩过）。 */
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => onReject?.(req)} disabled={actionPending} className="review-btn review-btn--reject disabled:opacity-50">驳回</button>
              <button type="button" onClick={() => onApprove?.(req)} disabled={actionPending} className="review-btn review-btn--approve disabled:opacity-50">通过</button>
            </div>
          ) : (req.myRoles?.length ? (
            <div className="flex flex-col items-end gap-1.5">
              {req.myRoles.map((role) => {
                const label = CAGE_OP_SIGN_SLOTS.find((s) => s.role === role)?.label ?? role;
                return (
                  <div key={role} className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[var(--app-color-text-tertiary)]">{label}</span>
                    {role === "VET" ? (
                      <>
                        <button type="button" onClick={() => onSign?.(req, role, "approved")} disabled={actionPending} className="review-btn review-btn--approve disabled:opacity-50">同意</button>
                        <button type="button" onClick={() => onSign?.(req, role, "held")} disabled={actionPending} className="review-btn review-btn--reject disabled:opacity-50">暂缓</button>
                        <button type="button" onClick={() => onSign?.(req, role, "rejected")} disabled={actionPending} className="review-btn review-btn--reject disabled:opacity-50">不同意</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => onSign?.(req, role, "approved")} disabled={actionPending} className="review-btn review-btn--approve disabled:opacity-50">通过</button>
                        <button type="button" onClick={() => onSign?.(req, role, "rejected")} disabled={actionPending} className="review-btn review-btn--reject disabled:opacity-50">驳回</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* 三签单但三关都轮不到自己（比如归属地/目的地都签完了只等兽医）：
               卡片留在列表里看进度，明说在等谁，别留一片空白让人以为坏了 */
            <span className="text-[11px] text-[var(--app-color-text-tertiary)]">等待其他审核人签署</span>
          ))}
        </div>
      </div>
      {/* 两个弹窗都是 portal，挂哪儿都一样；跟着卡片走，省掉给整张卡重排缩进 */}
      {formOpen && (
        <PdfPreviewDialog
          title={`转移单 · ${req.applicantName || req.applicantId || ""}`}
          fileName={`转移单-${req.id}.pdf`}
          fetchPdf={() => fetchTransferFormPdf(req.id)}
          onClose={() => setFormOpen(false)}
        />
      )}
      {/* 临时打印走 pendingFile：确认时才上传成一次性模板，取消则服务端不留东西 */}
      {printFile && (
        <PrintDispatchDialog
          open
          onOpenChange={(v) => { if (!v) setPrintFile(null); }}
          sourceType="ADMIN_FILE"
          sourceId={String(req.id)}
          fileName={printFile.name}
          pendingFile={printFile}
        />
      )}
    </div>
  );
}
