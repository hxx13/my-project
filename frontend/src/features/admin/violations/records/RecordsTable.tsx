import { Fragment, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearStudentViolation,
  clearStudentViolationNotice,
  deleteStudentViolation,
  dispositionDetail,
  listStudentViolations,
  VIOLATION_STATUS_LABEL,
  type StudentViolationRow,
  type ViolationDispositionSummary,
} from "@/api/domains/studentViolation.api";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminCenteredPanelShell } from "@/components/admin/AdminCenteredPanelShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { violationEnterLocked } from "@/components/scanner/twinViolationInteractive";
import { richTextPlainPreview } from "@/utils/announcementHtml";
import { formatBeijingDateTimeMedium } from "@/utils/beijingTime";
import { cn } from "@/lib/utils";
import { dueSecondaryLabel, summarizeDispositionForDetail } from "../slots/dispositionTypes";
import { groupViolationRows, parseSignatureDataUrl, type ViolationGroupSegment, type ViolationPersonSegment } from "./recordsGrouping";
import type { RecordsFilters } from "./RecordsToolbar";

import { appConfirm } from "@/lib/appDialog";

export function parseRowImageUrls(row: StudentViolationRow): string[] {
  const raw = row.imageUrls;
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const j = JSON.parse(raw) as unknown;
      return Array.isArray(j) ? j.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function personDisplayName(r: StudentViolationRow): string {
  const n = (r.targetUserDisplayName ?? "").trim();
  return n || r.targetUserId;
}

/** 违规记录每页条数：默认列表后端分页，避免全量渲染卡顿。 */
const RECORDS_PAGE_SIZE = 20;

/** 主表列数（选择 / 课题组 / 人 / 违规说明·笼位 / 状态 / 来源 / 禁入 / 到期 / 公告 / 处置情况 / 操作） */
const COLS = 11;

/** 选择列复选框：逐行渲染、永不参与合并，与既有桩/合并逻辑解耦。 */
const CHECKBOX = "size-3.5 shrink-0 cursor-pointer align-middle accent-[var(--app-color-accent)]";

const th = "px-3 py-2 whitespace-nowrap";
const td = "px-3 py-2 align-top";

/** 笼位坐标 / 处置策略这类行内小标签：浅底描边 pill（与 sourceBadge 同源令牌）。 */
const TAG_PILL =
  "inline-flex items-center rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-text-secondary)]";

/** 块与块之间加粗上边线，避免两个下发批次连成一片。 */
const batchSep = "border-t-2 border-t-[var(--twin-hairline)]";

const STATUS_PILL: Record<string, { cls: string; dot: string }> = {
  ACTIVE: {
    cls: "border-[color-mix(in_srgb,var(--app-color-feedback-danger)_25%,transparent)] bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger)]",
    dot: "bg-[var(--app-color-feedback-danger)]",
  },
  SUPERSEDED: {
    cls: "border-[color-mix(in_srgb,var(--app-color-feedback-warning)_30%,transparent)] bg-[var(--app-color-feedback-warning-soft)] text-[var(--app-color-feedback-warning)]",
    dot: "bg-[var(--app-color-feedback-warning)]",
  },
  CLEARED: {
    cls: "border-[color-mix(in_srgb,var(--app-color-feedback-success)_25%,transparent)] bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)]",
    dot: "bg-[var(--app-color-feedback-success)]",
  },
  PROCESSED: {
    cls: "border-[color-mix(in_srgb,var(--app-color-feedback-success)_25%,transparent)] bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)]",
    dot: "bg-[var(--app-color-feedback-success)]",
  },
  EXPIRED: {
    cls: "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)]",
    dot: "bg-[var(--app-color-text-tertiary)]",
  },
};

const CAGE_STATUS_LABEL: Record<string, string> = {
  COHABITATION: "合笼/繁殖",
  SPECIAL_FEEDING: "特殊饲养",
  NEED_DIVIDE: "请分笼/密度超标",
  HEALTH_ABNORMAL: "动物健康异常",
  ANIMAL_TRANSFER: "动物转移",
};

function statusPill(r: StudentViolationRow) {
  const s = STATUS_PILL[r.status ?? ""] ?? STATUS_PILL.EXPIRED;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold", s.cls)}>
      <span className={cn("h-1 w-1 rounded-full", s.dot)} />
      {VIOLATION_STATUS_LABEL[r.status as keyof typeof VIOLATION_STATUS_LABEL] || r.status || "—"}
    </span>
  );
}

function sourceBadge(source: string | undefined): JSX.Element {
  if (source === "AUTO_STRANDED") {
    return <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--app-color-feedback-warning)_40%,transparent)] bg-[var(--app-color-feedback-warning-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-feedback-warning)]">自动滞留</span>;
  }
  if (source === "CAGE_STATUS") {
    return <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--app-color-feedback-success)_40%,transparent)] bg-[var(--app-color-feedback-success-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-feedback-success)]">笼架联动</span>;
  }
  return <span className="inline-flex items-center rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-text-secondary)]">手动</span>;
}

/**
 * 公告列：大屏公示要求 status=ACTIVE 且未被单独解除（与后端 boardVisibleClause 同口径）。
 * 非生效状态本就不上板，显示「—」而不是「生效中」。
 */
function noticeBadge(r: StudentViolationRow): JSX.Element {
  // noticeState 由后端按大屏可见性同口径算出（见 boardVisibleClause）
  if (r.noticeState === "CLEARED") {
    return (
      <span
        title={r.noticeClearedAt ? `解除时间 ${formatBeijingDateTimeMedium(r.noticeClearedAt)}` : undefined}
        className="inline-flex items-center rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-text-secondary)]"
      >
        已解除
      </span>
    );
  }
  if (r.noticeState === "ACTIVE") {
    return (
      <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--app-color-feedback-success)_40%,transparent)] bg-[var(--app-color-feedback-success-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-feedback-success)]">
        生效中
      </span>
    );
  }
  if (r.noticeState === "WINDOW_ENDED") {
    return (
      <span className="inline-flex items-center rounded-full border border-[var(--app-color-border-default)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-text-tertiary)]">
        展示已结束
      </span>
    );
  }
  // NOT_ACTIVE（解除/过期等非生效状态）本就不上板
  return <span className="text-[11px] text-[var(--app-color-text-tertiary)]">—</span>;
}

/**
 * 大屏「提醒公示」每人只展示一条（同人 MAX(id)）。同一人有多条生效时，
 * 删掉其中一条不会让人下榜，另一条会顶上来——必须让管理员在删之前就看到。
 */
function boardBadge(r: StudentViolationRow): JSX.Element | null {
  const n = r.activeSameUserCount ?? 0;
  if (n <= 1) return null;
  const base = "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium";
  if (r.boardDisplayed) {
    return (
      <span className={`${base} border-[color-mix(in_srgb,var(--app-color-feedback-info)_40%,transparent)] bg-[var(--app-color-feedback-info-soft)] text-[var(--app-color-feedback-info)]`}>
        大屏公示中 · 同人共 {n} 条
      </span>
    );
  }
  return (
    <span className={`${base} border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)]`}>
      同人共 {n} 条 · 大屏另展示一条
    </span>
  );
}

function dueMeta(r: StudentViolationRow): { primary: string; secondary: string; late: boolean } {
  if (r.status === "CLEARED" || r.status === "PROCESSED") {
    return { primary: String(r.expireAt ?? "").slice(0, 10) || "—", secondary: "已解除", late: false };
  }
  if (r.status === "EXPIRED") {
    return { primary: String(r.expireAt ?? "").slice(0, 10) || "—", secondary: "已过期", late: true };
  }
  const secondary = dueSecondaryLabel(r);
  if (!r.expireAt) return { primary: "—", secondary, late: false };
  const remain = Math.ceil((new Date(r.expireAt).getTime() - Date.now()) / 86_400_000);
  if (remain <= 0) return { primary: String(r.expireAt).slice(0, 10), secondary: "已过期", late: true };
  return { primary: String(r.expireAt).slice(0, 10), secondary, late: false };
}

/** 处置情况列：stateLabel · typeLabel + detail + 按需拉签名图。 */
function dispositionCell(disp: ViolationDispositionSummary | null | undefined, rowId: number, onViewSignature: (id: number) => void): JSX.Element {
  if (!disp) return <span className="text-[var(--app-color-text-tertiary)]">—</span>;
  const main = [disp.stateLabel, disp.typeLabel].filter(Boolean).join(" · ");
  return (
    <div className="space-y-0.5">
      {main ? <div className="text-xs font-medium text-[var(--app-color-text-primary)]">{main}</div> : null}
      {disp.detail ? <div className="text-[11px] text-[var(--app-color-text-tertiary)]">{disp.detail}</div> : null}
      {disp.hasSignatureImage ? (
        <AdminButton type="button" size="sm" tone="secondary" onClick={() => onViewSignature(rowId)}>
          查看签名
        </AdminButton>
      ) : null}
    </div>
  );
}

type RecordsTableProps = {
  filters: RecordsFilters;
  onEdit: (row: StudentViolationRow) => void;
};

/**
 * 单表：按下发批次成块，块内先按课题组合并格、再按「人」合并格（同一人可有多条不同笼位的违规）；
 * 行级字段逐行。数据查询与解除/删除逻辑不变；展开详情行保留（点「详情」）。
 */
export function RecordsTable({ filters, onEdit }: RecordsTableProps): JSX.Element {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [sigOpen, setSigOpen] = useState(false);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [sigError, setSigError] = useState<string | null>(null);
  const [sigLoading, setSigLoading] = useState(false);
  /** 批量操作的选中行 id。 */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const keyword = filters.keyword.trim();

  // 关键词变化时回到第 1 页（关键词场景不后端分页，走全量前端收窄）
  useEffect(() => { setPage(1); }, [keyword]);

  // 状态/来源/禁入已下沉到服务端 SQL（过滤在 LIMIT 之前），列表对该筛选确定且完整；
  // keyword 依赖展示名/规则名，留在前端收窄。有 keyword 时拉全量(500)前端过滤；无 keyword 时后端分页。
  const personListKey = useMemo(
    () => ["studentViolations", filters.statuses, filters.sources, filters.enterLocks, keyword ? "kw" : page] as const,
    [filters.statuses, filters.sources, filters.enterLocks, keyword, page]
  );

  const { data, isLoading } = useQuery({
    queryKey: personListKey,
    queryFn: () =>
      listStudentViolations({
        ...(keyword ? { limit: 500 } : { page, pageSize: RECORDS_PAGE_SIZE }),
        // 不要再传 excludeCage：那是旧「按人员 / 按笼架」双视图时代的遗留（人员视图排除笼架记录，
        // 笼架记录走独立视图）。两视图已合并为一张表，继续排除会让**所有笼架触发的违规消失**。
        statuses: filters.statuses.length ? filters.statuses : undefined,
        sources: filters.sources.length ? filters.sources : undefined,
        // enterLocks 三态：[]=不过滤 / [LOCKED]=仅禁入 / [UNLOCKED]=仅可进入 / [两个]=全部
        lockedOnly:
          filters.enterLocks.length === 1 ? filters.enterLocks[0] === "LOCKED" : undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const rows = data?.list ?? [];
  const total = data?.total ?? 0;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / RECORDS_PAGE_SIZE)), [total]);

  // 删除最后一条/筛选收窄后页码可能超界，回退到最后一页
  useEffect(() => { if (!keyword && page > totalPages) setPage(totalPages); }, [page, totalPages, keyword]);

  // 列表数据一变（切筛选 / 翻页 / refetch 后）即清空选择，避免选到已不可见的行
  useEffect(() => { setSelectedIds(new Set()); }, [data]);

  const filteredRows = useMemo(() => {
    let filtered = rows;
    if (keyword) {
      const kw = keyword.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          (r.targetUserDisplayName ?? "").toLowerCase().includes(kw) ||
          r.targetUserId.toLowerCase().includes(kw) ||
          (r.ruleName ?? "").toLowerCase().includes(kw)
      );
    }
    return filtered;
  }, [rows, keyword]);

  // 顺序完全依赖后端（batch_id DESC, id ASC）——只连续分段，不排序
  const blocks = useMemo(() => groupViolationRows(filteredRows), [filteredRows]);

  const handleClear = async (id: number) => {
    if (!await appConfirm("解除后该条将不再在扫码弹窗展示，记录仍保留。确定？")) return;
    try {
      await clearStudentViolation(id);
      toast.success("已解除");
      await qc.invalidateQueries({ queryKey: ["studentViolations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "解除失败");
    }
  };

  const handleClearNotice = async (id: number) => {
    if (!await appConfirm("解除公告后该条不再上大屏公示，记录与禁入均不变。确定？")) return;
    try {
      await clearStudentViolationNotice(id);
      toast.success("已解除公告");
      await qc.invalidateQueries({ queryKey: ["studentViolations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "解除公告失败");
    }
  };

  const handleDelete = async (r: StudentViolationRow) => {
    if (!await appConfirm(`确定物理删除记录 #${r.id}？不可恢复。`)) return;
    try {
      await deleteStudentViolation(r.id);
      toast.success("已删除");
      await qc.invalidateQueries({ queryKey: ["studentViolations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * 批量动作：串行 for...of（不并发轰后端），逐条收集成败。
   * 部分失败时错误提示带上第一个失败原因，不吞异常。
   */
  const runBatch = async (verb: "解除" | "删除", ids: number[], action: (id: number) => Promise<void>) => {
    if (!await appConfirm(
      verb === "解除"
        ? `将解除已选 ${ids.length} 条记录：不再在扫码弹窗展示，记录仍保留。确定？`
        : `将物理删除已选 ${ids.length} 条记录，不可恢复。确定？`
    )) return;
    setBatchRunning(true);
    let ok = 0;
    const errors: string[] = [];
    for (const id of ids) {
      try {
        await action(id);
        ok += 1;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "未知错误");
      }
    }
    setBatchRunning(false);
    setSelectedIds(new Set());
    await qc.invalidateQueries({ queryKey: ["studentViolations"] });
    if (errors.length) {
      toast.error(`已${verb} ${ok} 条，${errors.length} 条失败：${errors[0]}`);
    } else {
      toast.success(`已${verb} ${ok} 条`);
    }
  };

  // 签名图只在点击后拉取，不预取
  const openSignature = async (id: number) => {
    setSigOpen(true);
    setSigUrl(null);
    setSigError(null);
    setSigLoading(true);
    try {
      const detail = await dispositionDetail(id);
      const url = parseSignatureDataUrl(detail.answerPayload);
      if (url) setSigUrl(url);
      else setSigError("未找到签名图");
    } catch (e) {
      setSigError(e instanceof Error ? e.message : "加载签名失败");
    } finally {
      setSigLoading(false);
    }
  };

  if (isLoading) {
    return <AdminTableShell loading>{null}</AdminTableShell>;
  }
  if (filteredRows.length === 0) {
    return (
      <AdminTableShell empty emptyMessage={rows.length === 0 ? "暂无违规记录" : "无匹配记录"}>
        {null}
      </AdminTableShell>
    );
  }

  const groupCell = (seg: ViolationGroupSegment, allowMerge: boolean, dim: string) => (
    <td
      rowSpan={allowMerge ? seg.rowSpan : undefined}
      className={cn(td, "min-w-[9rem] font-medium", dim)}
    >
      {seg.name ?? "—"}
    </td>
  );

  const personCell = (seg: ViolationPersonSegment, allowMerge: boolean, dim: string) => (
    <td rowSpan={allowMerge ? seg.rowSpan : undefined} className={cn(td, "min-w-[10rem]")}>
      <div className="min-w-0">
        <div className={cn("truncate text-sm font-semibold", dim)}>{seg.name}</div>
        <div className="font-mono text-[11px] text-[var(--app-color-text-tertiary)]">{seg.key}</div>
      </div>
    </td>
  );

  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.id));

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* 批量操作条：仅在有选中时出现。shrink-0 保住外层高度链（整页不滚，只列表区滚）。 */}
      {selectedIds.size > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] px-3 py-2">
          <span className="text-xs text-[var(--app-color-text-secondary)]">已选 {selectedIds.size} 条</span>
          <div className="ml-auto flex items-center gap-2">
            <AdminButton
              type="button"
              tone="secondary"
              size="sm"
              loading={batchRunning}
              onClick={() => void runBatch("解除", [...selectedIds], clearStudentViolation)}
            >
              批量解除
            </AdminButton>
            <button
              type="button"
              disabled={batchRunning}
              onClick={() => void runBatch("删除", [...selectedIds], deleteStudentViolation)}
              className="inline-flex h-8 items-center rounded-[length:var(--admin-radius-md,0.375rem)] bg-[var(--app-color-feedback-danger)] px-3 text-sm font-medium text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[color:var(--admin-focus-ring)] disabled:opacity-60"
            >
              批量删除
            </button>
            <AdminButton
              type="button"
              tone="ghost"
              size="sm"
              disabled={batchRunning}
              onClick={() => setSelectedIds(new Set())}
            >
              取消选择
            </AdminButton>
          </div>
        </div>
      ) : null}
      {/* 不要传 scrollable：它会再给内层封 max-h-[min(72vh,780px)]，与外层拉伸出的高度差
          会在表格下方留一大块空白。本页外层已由 h-[calc(100dvh-var(--admin-chrome-offset))] + flex 链
          给出确定高度，滚动交给 AdminTableShell 自带的外层 overflow-x-auto（y 轴随之计算为 auto）。
          同样**不能加 flex-1**：横向滚动条画在滚动容器（这张卡片）的底边上，卡片一旦被 flex-1
          撑满整屏，列表短时表格只占顶部一两行，滚动条就悬在下方几百像素的空白里，看着像「跑到表格外面」。
          只留 min-h-0（解除内容高度下限）：长表照样被压到可用高度内滚动，短表卡片贴合内容。 */}
      <AdminTableShell className="min-h-0">
        <table className="twin-table twin-table--merged-rows violation-records-table w-max min-w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className={cn(th, "w-[2.5rem]")}>
                <input
                  type="checkbox"
                  aria-label="全选当前列表"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && selectedIds.size > 0; }}
                  onChange={() => setSelectedIds(allSelected ? new Set() : new Set(filteredRows.map((r) => r.id)))}
                  className={CHECKBOX}
                />
              </th>
              <th className={cn(th, "min-w-[9rem]")}>课题组</th>
              <th className={cn(th, "min-w-[10rem]")}>人</th>
              <th className={cn(th, "min-w-[16rem] border-l border-l-[var(--twin-hairline)]")}>违规说明 · 笼位</th>
              <th className={cn(th, "min-w-[6rem]")}>状态</th>
              <th className={cn(th, "min-w-[6rem]")}>来源</th>
              <th className={cn(th, "min-w-[5.5rem]")}>禁入</th>
              <th className={cn(th, "min-w-[7rem]")}>到期</th>
              <th className={cn(th, "min-w-[5.5rem]")}>公告</th>
              <th className={cn(th, "min-w-[9rem]")}>处置情况</th>
              <th className={cn(th, "min-w-[7.5rem] text-right col-actions")}>操作</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((block, bi) => {
              // 该块内有展开详情行时禁用 rowSpan 合并（详情行会占满整行，撑破合并格）
              const blockHasExpanded = expandedId != null && block.rows.some((r) => r.id === expandedId);
              const allowMerge = !blockHasExpanded;
              return (
                <Fragment key={`${block.batchId}#${bi}`}>
                  {block.rows.map((r, i) => {
                    const imgs = parseRowImageUrls(r);
                    const dm = dueMeta(r);
                    const locked = violationEnterLocked(r);
                    const open = expandedId === r.id;
                    const disp = summarizeDispositionForDetail(r);
                    const bbadge = boardBadge(r);
                    const seg = block.groups.find((g) => g.startIndex === i);
                    const pseg = block.persons.find((p) => p.startIndex === i);
                    // 已解除 / 已过期保留展示，仅文字色降级（primary→secondary、secondary→tertiary）
                    const historical = r.status === "CLEARED" || r.status === "EXPIRED";
                    const c1 = historical ? "text-[var(--app-color-text-secondary)]" : "text-[var(--app-color-text-primary)]";
                    const c2 = historical ? "text-[var(--app-color-text-tertiary)]" : "text-[var(--app-color-text-secondary)]";
                    return (
                      <Fragment key={r.id}>
                        <tr className={cn("group", i === 0 && batchSep)}>
                          {/* 选择列：逐行渲染，永不参与合并 —— 合并格段内的行也必须出这一格，
                              否则这些行 td 数会比表头短。 */}
                          <td className={cn(td, "w-[2.5rem]")}>
                            <input
                              type="checkbox"
                              aria-label={`选择记录 #${r.id}`}
                              checked={selectedIds.has(r.id)}
                              onChange={() => toggleSelect(r.id)}
                              className={CHECKBOX}
                            />
                          </td>

                          {/* 课题组：段首行出合并格。合并块放最左、与逐行字段用竖线分开
                              （对齐 animal-order-review 的整单级/行级分栏形态） */}
                          {seg
                            ? groupCell(seg, allowMerge, c2)
                            : allowMerge
                              ? null
                              : <td className={cn(td, "min-w-[9rem]")} />}

                          {/* 人：同一人的多条违规（不同笼位/策略）合成一格 */}
                          {pseg
                            ? personCell(pseg, allowMerge, c1)
                            : allowMerge
                              ? null
                              : <td className={cn(td, "min-w-[10rem]")} />}

                          {/* 违规说明 · 笼位 —— 左竖线即「合并块 | 逐行字段」的分界 */}
                          <td className={cn(td, "min-w-[16rem] max-w-[24rem] border-l border-l-[var(--twin-hairline)]")}>
                            <div className="min-w-0">
                              {bbadge ? <div className="mb-0.5">{bbadge}</div> : null}
                              <p className={cn("line-clamp-2 text-xs leading-snug", c2)}>
                                {richTextPlainPreview(r.violationText || "", 120) || "—"}
                              </p>
                              {imgs.length ? (
                                <div className="mt-1 flex gap-1">
                                  {imgs.slice(0, 3).map((u) => (
                                    <img key={u} src={u} alt="" className="h-6 w-6 rounded border border-[var(--app-color-border-default)] object-cover" />
                                  ))}
                                </div>
                              ) : null}
                              {/* 行内标签：笼位坐标（笼架联动才有）+ 处置策略 */}
                              {r.cageParentPosition || r.disposition?.typeLabel ? (
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  {r.cageParentPosition ? <span className={TAG_PILL}>{r.cageParentPosition}</span> : null}
                                  {r.disposition?.typeLabel ? <span className={TAG_PILL}>{r.disposition.typeLabel}</span> : null}
                                </div>
                              ) : null}
                            </div>
                          </td>

                          {/* 状态 */}
                          <td className={td}>{statusPill(r)}</td>

                          {/* 来源 */}
                          <td className={td}>{sourceBadge(r.source)}</td>

                          {/* 禁入 */}
                          <td className={cn(td, "text-xs font-semibold", locked ? "text-[var(--app-color-feedback-danger)]" : "text-[var(--app-color-feedback-success)]")}>
                            {locked ? "⛔ 已禁入" : "✓ 可进入"}
                          </td>

                          {/* 到期 */}
                          <td className={cn(td, "text-xs tabular-nums", dm.late ? "font-semibold text-[var(--app-color-feedback-danger)]" : c1)}>
                            {dm.primary}
                            <div className={cn("mt-0.5 text-[11px]", dm.late ? "text-[color-mix(in_srgb,var(--app-color-feedback-danger)_80%,transparent)]" : "text-[var(--app-color-text-tertiary)]")}>{dm.secondary}</div>
                          </td>

                          {/* 公告 */}
                          <td className={td}>{noticeBadge(r)}</td>

                          {/* 处置情况 */}
                          <td className={td}>{dispositionCell(r.disposition, r.id, (id) => void openSignature(id))}</td>

                          {/* 操作：详情 + 「更多操作」下拉并排。
                              整列 col-actions 冻结在右端（见 index.css .violation-records-table）。
                              **按钮常显、不做 hover 才显形**：冻结列本身就是常驻的一栏，
                              不悬停时留一条空白白条比多两个按钮更扎眼。 */}
                          <td className={cn(td, "text-right col-actions")}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setExpandedId(open ? null : r.id)}
                                className="inline-flex h-7 items-center rounded-md border border-[var(--app-color-border-default)] px-2.5 text-xs text-[var(--app-color-text-secondary)] outline-none transition-colors hover:bg-[var(--app-color-surface-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--admin-focus-ring)]"
                              >
                                {open ? "收起" : "详情"}
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label="更多操作"
                                    title="更多操作"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] outline-none transition-colors hover:bg-[var(--app-color-surface-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--admin-focus-ring)]"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[9rem]">
                                  <DropdownMenuItem
                                    className="focus:bg-[var(--app-color-surface-hover)] focus:text-[var(--app-color-text-primary)]"
                                    onSelect={() => onEdit(r)}
                                  >
                                    编辑
                                  </DropdownMenuItem>
                                  {r.status === "ACTIVE" ? (
                                    <DropdownMenuItem
                                      className="text-[var(--app-color-feedback-warning)] focus:bg-[var(--app-color-surface-hover)] focus:text-[var(--app-color-feedback-warning)]"
                                      onSelect={() => void handleClear(r.id)}
                                    >
                                      解除
                                    </DropdownMenuItem>
                                  ) : null}
                                  {r.status === "ACTIVE" && !r.noticeClearedAt ? (
                                    <DropdownMenuItem
                                      className="text-[var(--app-color-feedback-info)] focus:bg-[var(--app-color-surface-hover)] focus:text-[var(--app-color-feedback-info)]"
                                      onSelect={() => void handleClearNotice(r.id)}
                                    >
                                      解除公告
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-[var(--app-color-feedback-danger)] focus:bg-[var(--app-color-surface-hover)] focus:text-[var(--app-color-feedback-danger)]"
                                    onSelect={() => void handleDelete(r)}
                                  >
                                    删除
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>

                        {open ? (
                          <tr data-detail-row>
                            <td colSpan={COLS} className="bg-[var(--app-color-surface-elevated)] px-3 py-3">
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <DetailItem k="记录 ID" v={`#${r.id}`} />
                                <DetailItem k="关联规则" v={r.ruleName || "—"} mono={false} />
                                <DetailItem k="处置策略" v={disp.strategyLabel} mono={false} />
                                <DetailItem k="拼图短语" v={disp.challengePhrase} mono={false} />
                                <DetailItem k="处置动作" v={disp.actionsLabel} mono={false} />
                                <DetailItem k="立即禁入" v={disp.forbidEnter} mono={false} />
                                <DetailItem k="验证后解禁" v={disp.unlockOnVerify} mono={false} />
                                <DetailItem k="每次扫码提示" v={disp.everyScan} mono={false} />
                                <DetailItem k="进入计数" v={disp.maxEnter} />
                                <DetailItem k="到期时间" v={disp.expireAt} />
                                <DetailItem k="到期说明" v={disp.expireHint} mono={false} />
                                <DetailItem k="创建时间" v={formatBeijingDateTimeMedium(r.createdAt)} />
                                <DetailItem
                                  k={r.status === "CLEARED" || r.status === "PROCESSED" ? "解除人" : "创建人"}
                                  v={
                                    (r.clearedByDisplayName || r.createdByDisplayName || "").trim()
                                    || r.clearedByUserId
                                    || r.createdByUserId
                                    || "系统"
                                  }
                                />
                                {r.cageViolationId != null ? (
                                  <>
                                    <DetailItem
                                      k="笼位状态"
                                      v={(CAGE_STATUS_LABEL[r.cageParentStatus ?? ""] ?? r.cageParentStatus) || "—"}
                                      mono={false}
                                    />
                                    <DetailItem k="笼位" v={r.cageParentPosition || "—"} mono={false} />
                                    <DetailItem k="课题组" v={r.cageParentGroup || "—"} mono={false} />
                                  </>
                                ) : null}
                                <DetailItem
                                  k="违规正文"
                                  v={richTextPlainPreview(r.violationText || "", 200) || "—"}
                                  mono={false}
                                />
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </AdminTableShell>

      {/* 分页器（仅无关键词时后端分页；关键词场景为全量前端收窄，不分页） */}
      {!keyword && total > RECORDS_PAGE_SIZE && (
        <div className="flex shrink-0 items-center justify-between gap-3 text-xs">
          <span className="text-[var(--app-color-text-tertiary)]">共 {total} 条 · 每页 {RECORDS_PAGE_SIZE} 条</span>
          <div className="flex items-center gap-2">
            <AdminButton type="button" tone="secondary" size="sm" disabled={page <= 1 || isLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              上一页
            </AdminButton>
            <span className="whitespace-nowrap text-[var(--app-color-text-secondary)]">{page} / {totalPages}</span>
            <AdminButton type="button" tone="secondary" size="sm" disabled={page >= totalPages || isLoading} onClick={() => setPage((p) => p + 1)}>
              下一页
            </AdminButton>
          </div>
        </div>
      )}

      <AdminCenteredPanelShell
        open={sigOpen}
        onClose={() => setSigOpen(false)}
        ariaLabel="签名图"
        title="签名确认"
        className="max-w-[min(720px,96vw)]"
      >
        <div className="flex min-h-[200px] items-center justify-center p-4">
          {sigLoading ? (
            <span className="text-sm text-[var(--app-color-text-tertiary)]">加载中…</span>
          ) : sigError ? (
            <span className="text-sm text-[var(--app-color-feedback-danger)]">{sigError}</span>
          ) : sigUrl ? (
            <img
              src={sigUrl}
              alt="签名"
              className="max-h-[60vh] w-auto rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]"
            />
          ) : null}
        </div>
      </AdminCenteredPanelShell>
    </div>
  );
}

function DetailItem({ k, v, mono = true }: { k: string; v: string; mono?: boolean }): JSX.Element {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold tracking-wide text-[var(--app-color-text-tertiary)]">{k}</div>
      <div className={cn("mt-0.5 truncate text-xs text-[var(--app-color-text-primary)]", mono && "font-mono text-[11px] text-[var(--app-color-text-secondary)]")}>
        {v}
      </div>
    </div>
  );
}
