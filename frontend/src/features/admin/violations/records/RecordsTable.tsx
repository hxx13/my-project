import { Fragment, useMemo, useState } from "react";
import type { JSX } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearStudentViolation,
  deleteStudentViolation,
  listStudentViolations,
  VIOLATION_STATUS_LABEL,
  type StudentViolationRow,
} from "@/api/domains/studentViolation.api";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { violationEnterLocked } from "@/components/scanner/twinViolationInteractive";
import { richTextPlainPreview } from "@/utils/announcementHtml";
import { cn } from "@/lib/utils";
import { dueSecondaryLabel, summarizeDispositionForDetail } from "../slots/dispositionTypes";
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

/** 6 列主表 Grid 模板（对齐原型 v4 `.tablerow`）。 */
const GRID_COLS = "grid-cols-[minmax(16rem,2.2fr)_6.5rem_8rem_7rem_8.5rem_7.5rem]";

const STATUS_PILL: Record<string, { cls: string; dot: string }> = {
  ACTIVE: {
    cls: "border-[var(--app-color-feedback-danger)]/25 bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger)]",
    dot: "bg-[var(--app-color-feedback-danger)]",
  },
  SUPERSEDED: {
    cls: "border-[var(--app-color-feedback-warning)]/30 bg-[var(--app-color-feedback-warning-soft)] text-[var(--app-color-feedback-warning)]",
    dot: "bg-[var(--app-color-feedback-warning)]",
  },
  CLEARED: {
    cls: "border-[var(--app-color-feedback-success)]/25 bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)]",
    dot: "bg-[var(--app-color-feedback-success)]",
  },
  PROCESSED: {
    cls: "border-[var(--app-color-feedback-success)]/25 bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)]",
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
    return <span className="inline-flex items-center rounded-full border border-[var(--app-color-feedback-warning)]/40 bg-[var(--app-color-feedback-warning-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-feedback-warning)]">自动滞留</span>;
  }
  if (source === "CAGE_STATUS") {
    return <span className="inline-flex items-center rounded-full border border-[var(--app-color-feedback-success)]/40 bg-[var(--app-color-feedback-success-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-feedback-success)]">笼架联动</span>;
  }
  return <span className="inline-flex items-center rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-text-secondary)]">手动</span>;
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

type RecordsTableProps = {
  filters: RecordsFilters;
  onEdit: (row: StudentViolationRow) => void;
};

/**
 * 6 列主表：人员·违规说明 / 状态 / 来源 / 禁入 / 到期 / 操作(hover 显现)。
 * 次要字段下翻为展开详情行；数据查询与解除/删除逻辑与旧 11 列表一致。
 */
export function RecordsTable({ filters, onEdit }: RecordsTableProps): JSX.Element {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 状态/来源/禁入/笼架排除已下沉到服务端 SQL（过滤在 LIMIT 之前），列表对该筛选确定且完整，
  // 不再因 400 条截断窗口滑动而出现「幻影」记录；keyword 仍依赖展示名/规则名，留在前端收窄。
  const personListKey = useMemo(
    () => ["studentViolations", filters.statuses, filters.sources, filters.enterLocks] as const,
    [filters.statuses, filters.sources, filters.enterLocks]
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: personListKey,
    queryFn: () =>
      listStudentViolations({
        limit: 400,
        excludeCage: true,
        statuses: filters.statuses.length ? filters.statuses : undefined,
        sources: filters.sources.length ? filters.sources : undefined,
        // enterLocks 三态：[]=不过滤 / [LOCKED]=仅禁入 / [UNLOCKED]=仅可进入 / [两个]=全部
        lockedOnly:
          filters.enterLocks.length === 1 ? filters.enterLocks[0] === "LOCKED" : undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const filteredRows = useMemo(() => {
    let filtered = rows;
    if (filters.keyword.trim()) {
      const kw = filters.keyword.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          (r.targetUserDisplayName ?? "").toLowerCase().includes(kw) ||
          r.targetUserId.toLowerCase().includes(kw) ||
          (r.ruleName ?? "").toLowerCase().includes(kw)
      );
    }
    return filtered;
  }, [rows, filters.keyword]);

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

  const handleDelete = async (r: StudentViolationRow) => {
    if (!await appConfirm(`确定物理删除记录 #${r.id}？不可恢复。`)) return;
    try {
      await deleteStudentViolation(r.id);
      toast.success("已删除");
      qc.setQueryData<StudentViolationRow[]>(personListKey, (prev) => (prev ?? []).filter((x) => x.id !== r.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  if (isLoading) {
    // loading/empty 分支不使用 children，传 null 占位（children 为必填 prop）
    return <AdminTableShell loading>{null}</AdminTableShell>;
  }
  if (filteredRows.length === 0) {
    return (
      <AdminTableShell empty emptyMessage={rows.length === 0 ? "暂无违规记录" : "无匹配记录"}>
        {null}
      </AdminTableShell>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm">
      {/* 表头固定：在滚动区外 */}
      <div className={cn("grid shrink-0 items-center border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3.5", GRID_COLS)}>
        <div className="py-2 text-[11px] font-semibold tracking-wide text-[var(--app-color-text-tertiary)]">人员 · 违规说明</div>
        <div className="py-2 text-[11px] font-semibold tracking-wide text-[var(--app-color-text-tertiary)]">状态</div>
        <div className="py-2 text-[11px] font-semibold tracking-wide text-[var(--app-color-text-tertiary)]">来源</div>
        <div className="py-2 text-[11px] font-semibold tracking-wide text-[var(--app-color-text-tertiary)]">禁入</div>
        <div className="py-2 text-[11px] font-semibold tracking-wide text-[var(--app-color-text-tertiary)]">到期</div>
        <div className="py-2 text-right text-[11px] font-semibold tracking-wide text-[var(--app-color-text-tertiary)]">操作</div>
      </div>

      {/* 表体：唯一滚动面 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {filteredRows.map((r) => {
          const imgs = parseRowImageUrls(r);
          const dm = dueMeta(r);
          const locked = violationEnterLocked(r);
          const open = expandedId === r.id;
          const disp = summarizeDispositionForDetail(r);
          return (
            <Fragment key={r.id}>
              <div className={cn("group grid items-center border-b border-[var(--app-color-border-default)] px-3.5 py-2.5 transition-colors hover:bg-[var(--app-color-surface-hover)]", GRID_COLS)}>
                {/* 人员 · 违规说明 */}
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-semibold text-[var(--app-color-text-primary)]">{personDisplayName(r)}</span>
                    <span className="shrink-0 font-mono text-[11px] text-[var(--app-color-text-tertiary)]">{r.targetUserId}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[var(--app-color-text-secondary)]">
                    {richTextPlainPreview(r.violationText || "", 120) || "—"}
                  </p>
                  {imgs.length ? (
                    <div className="mt-1 flex gap-1">
                      {imgs.slice(0, 3).map((u) => (
                        <img key={u} src={u} alt="" className="h-6 w-6 rounded border border-[var(--app-color-border-default)] object-cover" />
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* 状态 */}
                <div>{statusPill(r)}</div>

                {/* 来源 */}
                <div>{sourceBadge(r.source)}</div>

                {/* 禁入 */}
                <div className={cn("text-xs font-semibold", locked ? "text-[var(--app-color-feedback-danger)]" : "text-[var(--app-color-feedback-success)]")}>
                  {locked ? "⛔ 已禁入" : "✓ 可进入"}
                </div>

                {/* 到期 */}
                <div className={cn("text-xs tabular-nums text-[var(--app-color-text-primary)]", dm.late && "font-semibold text-[var(--app-color-feedback-danger)]")}>
                  {dm.primary}
                  <div className={cn("mt-0.5 text-[11px]", dm.late ? "text-[var(--app-color-feedback-danger)]/80" : "text-[var(--app-color-text-tertiary)]")}>{dm.secondary}</div>
                </div>

                {/* 操作：hover 显现 */}
                <div className="flex justify-end gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <AdminButton type="button" size="sm" tone="secondary" active={open} onClick={() => setExpandedId(open ? null : r.id)}>
                    {open ? "收起" : "详情"}
                  </AdminButton>
                  <AdminButton type="button" size="sm" tone="secondary" onClick={() => onEdit(r)}>编辑</AdminButton>
                  {r.status === "ACTIVE" ? (
                    <AdminButton
                      type="button"
                      size="sm"
                      tone="secondary"
                      className="text-[var(--app-color-feedback-warning)]"
                      onClick={() => void handleClear(r.id)}
                    >
                      解除
                    </AdminButton>
                  ) : null}
                  <AdminButton type="button" size="sm" tone="destructive" onClick={() => void handleDelete(r)}>删除</AdminButton>
                </div>
              </div>

              {open ? (
                <div className={cn("grid border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] px-3.5 py-3", GRID_COLS)}>
                  <div className="col-span-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </div>
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
