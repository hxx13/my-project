import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAutomationLogs, type AutomationLogRow } from "@/api/twinApi";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { adminHintClass } from "@/features/admin/adminFormUi";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import { detailTextToLines } from "@/utils/detailTextToLines";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";

const TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "AUTO_SIGNOUT", label: "离开自动化" },
  { value: "ACCESS_TRACE", label: "通行与联动步骤" },
  { value: "ACCESS_DEBUG", label: "联动调试追踪" },
  { value: "SCHEDULER", label: "定时器自动化" },
  { value: "EXEMPTION", label: "豁免自动化" },
  { value: "FACE_VERIFY", label: "门禁人脸验证" },
];

const TRIGGER_OPTIONS = [
  { value: "", label: "全部触发方式" },
  { value: "TIMER", label: "定时触发" },
  { value: "MANUAL", label: "手动触发" },
  { value: "SYSTEM", label: "系统触发" },
  { value: "USER", label: "用户触发" },
];

function toTime(value?: string) {
  return formatDateTimeAsiaShanghaiShort(value);
}

/**
 * 将前端日期/日期时间字符串转为后端 API 可接收的格式。
 * - datetime-local: "2024-01-15T14:30" → "2024-01-15 14:30:00"
 * - date: "2024-01-15" → 交由调用方决定是否拼接时分秒
 */
function toApiTime(value: string): string {
  if (!value) return "";
  // datetime-local 格式
  if (value.includes("T")) {
    const parts = value.split("T");
    const date = parts[0];
    const time = parts[1] || "00:00";
    // time 可能是 "14:30" 或 "14:30:00"
    const timeParts = time.split(":");
    const hh = timeParts[0]?.padStart(2, "0") ?? "00";
    const mm = timeParts[1]?.padStart(2, "0") ?? "00";
    const ss = timeParts[2]?.padStart(2, "0") ?? "00";
    return `${date} ${hh}:${mm}:${ss}`;
  }
  // 纯日期格式：保持原样返回，由调用方判断
  return value;
}

const PAGE_SIZE = 100;

function AuditImageThumb({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block shrink-0"
      title={`${label}（点击查看原图）`}
    >
      <img
        src={url}
        alt={label}
        className="h-14 w-14 rounded-md border border-[var(--app-color-border-subtle)] object-cover transition group-hover:opacity-90"
        loading="lazy"
      />
      <span className="mt-0.5 block max-w-[3.5rem] truncate text-[10px] text-[var(--twin-mute)]">{label}</span>
    </a>
  );
}

function FaceCompareImages({ row }: { row: AutomationLogRow }) {
  const [expanded, setExpanded] = useState(false);
  const probes = row.probeImageUrls ?? [];
  const baseline = row.baselineImageUrl;
  const previewLimit = 2;
  const hiddenCount = Math.max(0, probes.length - previewLimit);
  const visibleProbes = expanded || hiddenCount === 0 ? probes : probes.slice(0, previewLimit);

  if (probes.length === 0 && !baseline) {
    return <span className="text-[var(--twin-mute)]">—</span>;
  }

  return (
    <div className="max-w-[11rem] space-y-1">
      <div className="flex flex-wrap items-start gap-1.5">
        {visibleProbes.map((url, i) => (
          <AuditImageThumb key={`p-${url}`} url={url} label={probes.length > 1 ? `${i + 1}` : "抓拍"} />
        ))}
        {baseline ? <AuditImageThumb url={baseline} label="底库" /> : null}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="text-[10px] text-[var(--twin-link-deep)] hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "收起抓拍" : `展开抓拍 +${hiddenCount}`}
        </button>
      ) : null}
      {probes.length > 0 ? (
        <div className="text-[10px] text-[var(--twin-mute)]">共 {probes.length} 张抓拍</div>
      ) : null}
    </div>
  );
}

const compactInputClass =
  "h-8 min-w-0 w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus-visible:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25";

const compactSelectClass = "h-8 min-w-0 w-full px-2 text-xs";

export default function AdminAutomationLogsPage() {
  const [page, setPage] = useState(1);
  const [automationType, setAutomationType] = useState("");
  const [triggerType, setTriggerType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [showPenetrationLogs, setShowPenetrationLogs] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const pageInputRef = useRef<HTMLInputElement>(null);

  // 任意筛选条件变化时自动回到第 1 页
  useEffect(() => {
    setPage(1);
    setPageInput("");
  }, [automationType, triggerType, keyword, startTime, endTime, showPenetrationLogs]);

  const { data, isLoading } = useQuery({
    queryKey: ["automationLogs", page, automationType, triggerType, keyword, startTime, endTime, showPenetrationLogs] as const,
    queryFn: () =>
      fetchAutomationLogs({
        page,
        pageSize: PAGE_SIZE,
        automationType: automationType || undefined,
        triggerType: triggerType || undefined,
        keyword: keyword.trim() || undefined,
        startTime: startTime ? toApiTime(startTime) : undefined,
        endTime: endTime ? toApiTime(endTime) : undefined,
        excludePenetrationPoll: !showPenetrationLogs,
      }),
    placeholderData: (prev) => prev,
  });

  const rows: AutomationLogRow[] = data?.list ?? [];
  const total = data?.total ?? 0;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const applyFilter = () => setPage(1);

  const resetFilter = () => {
    setAutomationType("");
    setTriggerType("");
    setKeyword("");
    setStartTime("");
    setEndTime("");
    setShowPenetrationLogs(false);
    setPage(1);
    setPageInput("");
  };

  const location = useLocation();
  const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);

  return (
    <AdminPageShell>
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">

        {/* ═══ 第一层：操作+筛选卡片（shrink-0） ═══ */}
        <AdminFormCard className="shrink-0 mb-3">
          {/* 第一行：入口名称 */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
            <h2 className="text-base font-bold text-[var(--app-color-text-primary)] shrink-0">{pageLabel}</h2>
          </div>

          {/* 第二行：筛选控件 */}
          <div className="flex flex-wrap items-end gap-2 gap-y-1.5">
            <label className="flex w-[7.5rem] shrink-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">类型</span>
              <AdminSelect
                value={automationType}
                className={compactSelectClass}
                onChange={(e) => setAutomationType(e.target.value)}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </label>
            <label className="flex w-[7.5rem] shrink-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">触发</span>
              <AdminSelect
                value={triggerType}
                className={compactSelectClass}
                onChange={(e) => setTriggerType(e.target.value)}
              >
                {TRIGGER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </label>
            <label className="flex min-w-[10rem] flex-1 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">关键词</span>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="用户ID/姓名/原因/事件"
                className={compactInputClass}
              />
            </label>
            <label className="flex w-[10.5rem] shrink-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">开始时间</span>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={compactInputClass}
              />
            </label>
            <label className="flex w-[10.5rem] shrink-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">结束时间</span>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={compactInputClass}
              />
            </label>
            <div className="flex shrink-0 items-center gap-1.5 self-end pb-0.5">
              <AdminButton type="button" tone="primary" size="sm" className="h-8 px-3 text-xs" onClick={applyFilter}>
                筛选
              </AdminButton>
              <AdminButton type="button" tone="secondary" size="sm" className="h-8 px-3 text-xs" onClick={resetFilter}>
                重置
              </AdminButton>
            </div>
            <label className={`flex shrink-0 cursor-pointer items-center gap-1.5 self-end whitespace-nowrap pb-1 ${adminHintClass}`} title="含 ARO 穿甲同步、大屏排行榜刷新等高频定时任务">
              <AdminSwitchScaled
                size="3.5"
                checked={showPenetrationLogs}
                onChange={(checked) => {
                  setShowPenetrationLogs(checked);
                  setPage(1);
                }}
              />
              定时轮询日志
            </label>
          </div>
        </AdminFormCard>

        {/* ═══ 第二层：表格 + 翻页 ═══ */}
        <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto">
            {isLoading ? (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">加载中…</div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-[160px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">暂无日志</div>
            ) : (
              <div>
          <table className="w-full min-w-[800px] text-left text-xs border-collapse">
            <thead className="sticky top-0 z-[3] border-b-2 border-[var(--app-color-border-strong)] bg-[var(--app-color-surface-hover)] shadow-[var(--app-elevation-card)]">
              <tr className="text-[var(--app-color-text-secondary)] font-bold">
                <th className="px-2 py-1.5 whitespace-nowrap">时间</th>
                <th className="px-2 py-1.5 whitespace-nowrap">类型</th>
                <th className="px-2 py-1.5 whitespace-nowrap">触发方式</th>
                <th className="px-2 py-1.5 whitespace-nowrap">事件名称</th>
                <th className="px-2 py-1.5 whitespace-nowrap">用户ID</th>
                <th className="px-2 py-1.5 whitespace-nowrap">姓名</th>
                <th className="px-2 py-1.5 whitespace-nowrap">结果</th>
                <th className="px-2 py-1.5">比对图片</th>
                <th className="px-2 py-1.5">触发原因</th>
                <th className="px-2 py-1.5">详情</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.logSource ?? "twin"}-${r.id}`} className="border-b align-top hover:bg-[var(--twin-canvas-soft)]">
                  <td className="px-2 py-1.5 whitespace-nowrap">{toTime(r.eventTime)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <div>{r.automationTypeLabel || r.automationType || "-"}</div>
                    {r.automationTypeLabel && <div className="font-mono text-[10px] text-[var(--twin-mute)]">{r.automationType}</div>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <div>{r.triggerTypeLabel || r.triggerType || "-"}</div>
                    {r.triggerTypeLabel && <div className="font-mono text-[10px] text-[var(--twin-mute)]">{r.triggerType}</div>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <div>{r.eventKeyLabel || r.eventKey || "-"}</div>
                    {r.eventKeyLabel && <div className="font-mono text-[10px] text-[var(--twin-mute)]">{r.eventKey}</div>}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs whitespace-nowrap">{r.userId || "-"}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{r.userName || "-"}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {r.success === 1 ? <span className="text-emerald-600">成功</span> : <span className="text-rose-600">失败</span>}
                  </td>
                  <td className="px-2 py-1.5 max-w-[12rem]">
                    {r.automationType === "FACE_VERIFY" || r.logSource === "face" ? (
                      <FaceCompareImages row={r} />
                    ) : (
                      <span className="text-[var(--twin-mute)]">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 max-w-[12rem]">
                    <div className="break-words">{r.triggerReasonLabel || r.triggerReason || "-"}</div>
                    {r.triggerReasonLabel && <div className="font-mono text-[10px] text-[var(--twin-mute)] break-all">{r.triggerReason}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-[var(--twin-body)] max-w-[28rem] min-w-[10rem]">
                    <div className="space-y-1 break-words">
                      {detailTextToLines(String(r.detailDisplayZh || r.detail || "-")).map((line, i) => (
                        <div key={`dz-${i}`} className="leading-snug">
                          {line}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
              </div>
            )}
          </div>{/* 表格滚动区结束 */}

          {/* 翻页（shrink-0，始终可见） */}
          <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-t border-[var(--app-color-border-default)] text-sm">
            <span className="text-xs text-[var(--app-color-text-tertiary)]">
              共 {total} 条 · 每页 {PAGE_SIZE} 条 · 按时间倒序
            </span>
            <div className="flex items-center gap-2">
              <AdminButton type="button" tone="secondary" size="sm" disabled={page <= 1 || isLoading} onClick={() => { setPage((p) => Math.max(1, p - 1)); setPageInput(""); }}>
                上一页
              </AdminButton>
              <span className="flex items-center gap-1 text-xs text-[var(--app-color-text-secondary)] whitespace-nowrap">
                <input
                  ref={pageInputRef}
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const n = parseInt(pageInput, 10);
                      if (n >= 1 && n <= totalPages) {
                        setPage(n);
                        setPageInput("");
                      }
                    }
                  }}
                  placeholder={String(page)}
                  className="h-7 w-12 rounded border border-neutral-200 bg-white px-1.5 text-center text-xs outline-none focus-visible:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25"
                />
                / {totalPages}
              </span>
              <AdminButton type="button" tone="secondary" size="sm" disabled={page >= totalPages || isLoading} onClick={() => { setPage((p) => p + 1); setPageInput(""); }}>
                下一页
              </AdminButton>
            </div>
          </div>
        </div>{/* 表格阴影容器结束 */}
      </div>
    </AdminPageShell>
  );
}
