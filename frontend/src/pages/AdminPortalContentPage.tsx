import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Copy, FileText, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import {
  deleteContent,
  fetchPublicCategories,
  updateContent,
  type AdminContentSort,
  type ContentPriority,
  type ContentStatus,
  type ContentType,
  type PortalCategory,
  type PortalContentView,
} from "@/api/domains/portalContent.api";
import { useAdminContents, useDeleteContent, useUpdateContent } from "@/api/hooks/usePortalContent";
import { portalContentQueryKeys } from "@/api/hooks/queryKeys";
import { dateOnly } from "@/utils/beijingTime";
import { AdminBatchBar } from "@/components/admin/AdminBatchBar";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { AdminToolbar, AdminToolbarActions, AdminToolbarPrimary } from "@/components/admin/AdminToolbar";
import { ContentPriorityBadge } from "@/components/admin/ContentPriorityBadge";
import DataSkeleton from "@/components/ui/DataSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { appConfirm } from "@/lib/appDialog";

/* ── 静态口径 ── */

const TYPE_TABS: { value: ContentType | ""; label: string }[] = [
  { value: "", label: "全部" },
  { value: "NEWS", label: "科研文章" },
  { value: "NOTICE", label: "通知公告" },
  { value: "MODEL_RESOURCE", label: "模型资源" },
];

const TYPE_LABEL: Record<string, string> = {
  NEWS: "科研文章",
  NOTICE: "通知公告",
  MODEL_RESOURCE: "模型资源",
  PAGE: "页面",
};

const PRIORITY_OPTIONS: { value: ContentPriority; label: string }[] = [
  { value: "important", label: "重要" },
  { value: "notice", label: "通知" },
  { value: "routine", label: "常规" },
];

const STATUS_LABEL: Record<ContentStatus, string> = {
  PUBLISHED: "已发布",
  DRAFT: "草稿",
  ARCHIVED: "已归档",
};
/** 状态圆点色相走 .review-status 的 tone 映射 */
const STATUS_TONE: Record<ContentStatus, "ok" | "pending" | "none"> = {
  PUBLISHED: "ok",
  DRAFT: "pending",
  ARCHIVED: "none",
};

const SORT_OPTIONS: { value: AdminContentSort; label: string }[] = [
  { value: "updated", label: "按更新时间" },
  { value: "published", label: "按发布时间" },
  { value: "priority", label: "按重要性" },
  { value: "weight", label: "按排序权重" },
];

/** 行内动作按状态给，不用记规则：已发布→下线、草稿→发布、已归档→恢复 */
function nextStatusAction(status: ContentStatus): { label: string; next: ContentStatus; hint: string } {
  if (status === "PUBLISHED") {
    return { label: "下线", next: "ARCHIVED", hint: "确定下线？下线后该内容从门户消失，之后可「恢复」回草稿。" };
  }
  if (status === "ARCHIVED") {
    return { label: "恢复", next: "DRAFT", hint: "确定恢复？恢复后回到草稿状态，确认无误再点「发布」上线。" };
  }
  return { label: "发布", next: "PUBLISHED", hint: "确定发布？发布后立即出现在门户。" };
}

const previewPathOf = (row: PortalContentView) =>
  row.contentType === "MODEL_RESOURCE"
    ? `/models/${row.id}`
    : row.contentType === "NOTICE"
      ? `/news/notice/${row.id}`
      : `/news/article/${row.id}`;

const toolbarSelect = "h-[var(--admin-control-height)] text-xs";

export default function AdminPortalContentPage() {
  // tab 落 URL：编辑页保存/取消后跳回来能回到原来那一档（`?type=`），保持既有契约
  const [searchParams] = useSearchParams();
  const [typeFilter, setTypeFilter] = useState<ContentType | "">((searchParams.get("type") as ContentType) || "");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<ContentPriority | "">("");
  const [categoryFilter, setCategoryFilter] = useState<number | "">("");
  const [sort, setSort] = useState<AdminContentSort>("updated");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  // 筛选一变就回第 1 页，否则会停在一个已经不存在的页码上
  useEffect(() => {
    setPage(1);
  }, [typeFilter, statusFilter, priorityFilter, categoryFilter, sort, size, debouncedSearch]);

  const { data: pageData, isFetching } = useAdminContents({
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    categoryId: categoryFilter === "" ? undefined : categoryFilter,
    sort,
    search: debouncedSearch || undefined,
    page,
    size,
  });

  // 「重要」条数是单独一次 COUNT（size=1 只要 total），不能拿当前页去数
  const { data: importantData } = useAdminContents({
    type: typeFilter || undefined,
    priority: "important",
    page: 1,
    size: 1,
  });

  const [categories, setCategories] = useState<PortalCategory[]>([]);
  useEffect(() => {
    fetchPublicCategories().then(setCategories).catch(() => {});
  }, []);

  /** 分类下拉跟随当前类型档位（「全部」时列全量） */
  const catOptions = useMemo(() => {
    if (!typeFilter) return categories;
    return categories.filter((c) => c.scope === typeFilter || c.scope === "ALL");
  }, [categories, typeFilter]);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  // 换页/换筛选后旧选择已不在眼前，直接清掉，避免误伤看不见的行
  useEffect(() => {
    setSelected(new Set());
  }, [typeFilter, statusFilter, priorityFilter, categoryFilter, size, page, debouncedSearch]);

  const qc = useQueryClient();
  const updateMut = useUpdateContent();
  const deleteMut = useDeleteContent();

  const rows = pageData?.data ?? [];
  const total = pageData?.total ?? 0;
  const importantCount = importantData?.total ?? 0;
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));

  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleDelete = async (id: number) => {
    if (!(await appConfirm("确定删除？将移入回收站。"))) return;
    deleteMut.mutate(id);
  };

  const handleStatus = async (row: PortalContentView) => {
    const act = nextStatusAction(row.status);
    if (!(await appConfirm(act.hint))) return;
    updateMut.mutate({ id: row.id, body: { status: act.next } });
  };

  const handlePriority = (id: number, priority: ContentPriority) =>
    updateMut.mutate({ id, body: { extensionJson: JSON.stringify({ priority }) } });

  const handleWeight = (row: PortalContentView, raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v) || v === row.sortOrder) return;
    updateMut.mutate({ id: row.id, body: { sortOrder: v } });
  };

  /**
   * 批量：逐条并发调现有单条接口，最后只弹一次汇总提示。
   * 没有为此新增批量端点 —— 内容量级在百条以内，加端点不划算。
   * 走直连 api 而不是 useUpdateContent，是为了避免 N 条重复 toast。
   */
  const runBatch = async (ids: number[], fn: (id: number) => Promise<unknown>, okMsg: string) => {
    const results = await Promise.allSettled(ids.map(fn));
    const failed = results.filter((r) => r.status === "rejected").length;
    qc.invalidateQueries({ queryKey: portalContentQueryKeys.all });
    setSelected(new Set());
    if (failed === 0) toast.success(okMsg);
    else if (failed === ids.length) toast.error("操作失败，请重试");
    else toast.error(`${failed} 条失败，其余已处理`);
  };

  const batchIds = [...selected];
  const batchPriority = async (priority: ContentPriority) => {
    if (!(await appConfirm(`确定把选中的 ${batchIds.length} 条改为「${PRIORITY_OPTIONS.find((p) => p.value === priority)?.label}」？`))) return;
    void runBatch(batchIds, (id) => updateContent(id, { extensionJson: JSON.stringify({ priority }) }), "优先级已更新");
  };
  const batchArchive = async () => {
    if (!(await appConfirm(`确定归档选中的 ${batchIds.length} 条？归档后这些内容从门户下线。`))) return;
    void runBatch(batchIds, (id) => updateContent(id, { status: "ARCHIVED" }), "已归档");
  };
  const batchDelete = async () => {
    if (!(await appConfirm(`确定删除选中的 ${batchIds.length} 条？将移入回收站。`))) return;
    void runBatch(batchIds, (id) => deleteContent(id), "已移入回收站");
  };

  const createdHref = `/content-manager/content/new?type=${typeFilter}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
      {/* 页头 */}
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--app-color-text-primary)]">内容管理</h1>
          <p className="mt-0.5 text-xs text-[var(--app-color-text-tertiary)]">
            共 {total} 条
            {importantCount > 0 ? (
              <>
                {" · 其中 "}
                <span className="font-semibold text-[var(--app-color-feedback-danger-ink)]">{importantCount}</span>
                {" 条「重要」会置顶门户首页"}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link to="/content-manager/content/recycle">
            <AdminButton tone="secondary">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              回收站
            </AdminButton>
          </Link>
          <Link to={createdHref}>
            <AdminButton tone="primary">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              新建内容
            </AdminButton>
          </Link>
        </div>
      </div>

      {/* 工具条 */}
      <AdminToolbar className="shrink-0 rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3.5 py-2.5">
        <AdminToolbarPrimary>
          <input
            className="h-[var(--admin-control-height)] w-full rounded-[var(--admin-radius-md)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 text-sm text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-[color:var(--admin-focus-ring)]"
            placeholder="搜索标题…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </AdminToolbarPrimary>

        <div className="flex flex-wrap items-center gap-1.5">
          {TYPE_TABS.map((t) => (
            <AdminButton
              key={t.value || "all"}
              tone="ghost"
              active={typeFilter === t.value}
              className="h-[var(--admin-control-height)] px-3 text-xs"
              onClick={() => setTypeFilter(t.value)}
            >
              {t.label}
            </AdminButton>
          ))}
        </div>

        <AdminToolbarActions>
          <AdminSelect
            className={toolbarSelect}
            aria-label="按重要性筛选"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as ContentPriority | "")}
          >
            <option value="">优先级：全部</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </AdminSelect>

          <AdminSelect
            className={toolbarSelect}
            aria-label="按分类筛选"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">分类：全部</option>
            {catOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </AdminSelect>

          <AdminSelect
            className={toolbarSelect}
            aria-label="按状态筛选"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ContentStatus | "")}
          >
            <option value="">状态：全部</option>
            {(Object.keys(STATUS_LABEL) as ContentStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </AdminSelect>

          <AdminSelect
            className={toolbarSelect}
            aria-label="排序"
            value={sort}
            onChange={(e) => setSort(e.target.value as AdminContentSort)}
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </AdminSelect>
        </AdminToolbarActions>
      </AdminToolbar>

      {/* 批量条 */}
      <AdminBatchBar count={selected.size} onClear={() => setSelected(new Set())} className="shrink-0">
        <AdminSelect
          className="h-7 text-xs"
          aria-label="批量改优先级"
          value=""
          onChange={(e) => {
            if (e.target.value) void batchPriority(e.target.value as ContentPriority);
          }}
        >
          <option value="">改优先级：选择…</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </AdminSelect>
        <AdminButton tone="ghost" className="h-7 px-2 text-xs" onClick={() => void batchArchive()}>
          批量归档
        </AdminButton>
        <AdminButton tone="destructive" className="h-7 px-2 text-xs" onClick={() => void batchDelete()}>
          批量删除
        </AdminButton>
      </AdminBatchBar>

      {/* 表格 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="twin-table">
            <thead>
              <tr>
                <th className="w-[38px]">
                  <input
                    type="checkbox"
                    aria-label="全选本页"
                    checked={allChecked}
                    onChange={toggleAll}
                    disabled={rows.length === 0}
                  />
                </th>
                <th className="w-[64px]">ID</th>
                <th>标题</th>
                <th className="w-[92px]">类型</th>
                <th className="w-[110px]">分类</th>
                <th className="w-[100px]">优先级</th>
                <th className="w-[96px]">状态</th>
                <th className="w-[96px]">发布时间</th>
                <th className="w-[76px] text-right">权重</th>
                <th className="w-[250px] text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const act = nextStatusAction(row.status);
                const isNotice = row.contentType === "NOTICE";
                const isModel = row.contentType === "MODEL_RESOURCE";
                return (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`选择 ${row.title}`}
                        checked={selected.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                      />
                    </td>
                    <td className="font-mono text-xs text-[var(--app-color-text-tertiary)]">#{row.id}</td>
                    <td className="max-w-0">
                      <div className="truncate font-medium text-[var(--app-color-text-primary)]" title={row.title}>
                        {row.title}
                      </div>
                      {row.summary ? (
                        <div className="truncate text-xs text-[var(--app-color-text-tertiary)]" title={row.summary}>
                          {row.summary}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center rounded-md border border-[var(--app-color-border-default)] px-2 py-0.5 text-[11px] text-[var(--app-color-text-secondary)]">
                        {TYPE_LABEL[row.contentType] ?? row.contentType}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-xs">{row.categoryName || "—"}</td>
                    <td>
                      {isNotice ? <ContentPriorityBadge item={row} /> : <span className="text-xs text-[var(--app-color-text-tertiary)]">—</span>}
                    </td>
                    <td>
                      <span className="review-status" data-tone={STATUS_TONE[row.status]}>
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-xs tabular-nums">
                      {row.publishedAt ? dateOnly(row.publishedAt) : "—"}
                    </td>
                    <td className="text-right">
                      {isModel ? (
                        <input
                          type="number"
                          defaultValue={row.sortOrder}
                          aria-label="排序权重"
                          title="越大越靠前"
                          className="h-7 w-16 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1.5 text-right text-xs tabular-nums text-[var(--app-color-text-primary)] outline-none focus-visible:border-ring"
                          onBlur={(e) => handleWeight(row, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                      ) : (
                        <span className="text-xs tabular-nums text-[var(--app-color-text-tertiary)]">{row.sortOrder}</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <Link to={`/content-manager/content/${row.id}/edit`}>
                          <AdminButton tone="ghost" className="h-7 px-2.5 text-xs">
                            编辑
                          </AdminButton>
                        </Link>
                        {row.status === "PUBLISHED" ? (
                          <a href={`/#${previewPathOf(row)}`} target="_blank" rel="noopener noreferrer">
                            <AdminButton tone="ghost" className="h-7 px-2.5 text-xs">
                              预览
                            </AdminButton>
                          </a>
                        ) : null}
                        <AdminButton
                          tone="ghost"
                          className="h-7 px-2.5 text-xs"
                          onClick={() => void handleStatus(row)}
                        >
                          {act.label}
                        </AdminButton>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <AdminButton tone="ghost" className="h-7 w-7 px-0" aria-label="更多操作">
                              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                            </AdminButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[11rem]">
                            <DropdownMenuLabel>改优先级</DropdownMenuLabel>
                            {PRIORITY_OPTIONS.map((p) => (
                              <DropdownMenuItem
                                key={p.value}
                                disabled={!isNotice}
                                onSelect={() => handlePriority(row.id, p.value)}
                              >
                                {p.label}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link to={`/content-manager/content/new?copyFrom=${row.id}`}>
                                <Copy className="h-3.5 w-3.5" aria-hidden />
                                复制为新草稿
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-[var(--app-color-feedback-danger-ink)] focus:text-[var(--app-color-feedback-danger-ink)]"
                              onSelect={() => void handleDelete(row.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              删除（移入回收站）
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rows.length === 0 && isFetching ? <DataSkeleton variant="table" rows={6} className="p-2" /> : null}

          {rows.length === 0 && !isFetching ? (
            <EmptyState
              icon={FileText}
              title="没有符合条件的内容"
              description="换个筛选条件，或者新建一条。"
              className="m-4"
            />
          ) : null}
        </div>

        <AdminPagination
          className="shrink-0 border-t border-[var(--app-color-border-default)] px-4 py-2.5"
          total={total}
          page={page}
          size={size}
          onPageChange={setPage}
          onSizeChange={setSize}
        />
      </div>
    </div>
  );
}
