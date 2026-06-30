import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchAutomationLogs, type AutomationLogRow } from "@/api/twinApi";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { adminHintClass } from "@/features/admin/adminFormUi";
import { detailTextToLines } from "@/utils/detailTextToLines";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";

const TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "AUTO_SIGNOUT", label: "离开自动化" },
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

function toApiTime(value: string, tail: "00:00:00" | "23:59:59") {
  if (!value) return "";
  return `${value} ${tail}`;
}

const PAGE_SIZE = 50;

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
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showPenetrationLogs, setShowPenetrationLogs] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["automationLogs", page, automationType, triggerType, keyword, startDate, endDate, showPenetrationLogs] as const,
    queryFn: () =>
      fetchAutomationLogs({
        page,
        pageSize: PAGE_SIZE,
        automationType: automationType || undefined,
        triggerType: triggerType || undefined,
        keyword: keyword.trim() || undefined,
        startTime: startDate ? toApiTime(startDate, "00:00:00") : undefined,
        endTime: endDate ? toApiTime(endDate, "23:59:59") : undefined,
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
    setStartDate("");
    setEndDate("");
    setShowPenetrationLogs(false);
    setPage(1);
  };

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <FileText className="h-6 w-6 shrink-0 text-[var(--twin-link-deep)]" aria-hidden />
          自动化日志
        </span>
      }
      description="查看门禁联动、定时任务、人脸验证等自动化执行流水；可按类型、触发方式与时间筛选。"
    >
      <div className="flex flex-col gap-3">
        <AdminFormCard title="筛选" className="p-3 [&>div:first-child]:mb-2 [&>div:first-child]:pb-1.5">
          <div className="flex flex-nowrap items-end gap-2 overflow-x-auto">
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
            <label className="flex w-[8.5rem] shrink-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">开始</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={compactInputClass}
              />
            </label>
            <label className="flex w-[8.5rem] shrink-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-neutral-500">结束</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
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
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-neutral-300"
                checked={showPenetrationLogs}
                onChange={(e) => {
                  setShowPenetrationLogs(e.target.checked);
                  setPage(1);
                }}
              />
              定时轮询日志
            </label>
          </div>
        </AdminFormCard>

        <AdminTableShell
          loading={isLoading}
          empty={!isLoading && rows.length === 0}
          emptyMessage="暂无日志"
          scrollable
          className="[&_.admin-table-shell-inner]:max-h-[min(82vh,920px)]"
        >
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b bg-[var(--twin-canvas-soft)] text-left text-[var(--twin-body)]">
                <th className="px-2 py-1.5">时间</th>
                <th className="px-2 py-1.5">类型</th>
                <th className="px-2 py-1.5">触发方式</th>
                <th className="px-2 py-1.5">事件名称</th>
                <th className="px-2 py-1.5">用户ID</th>
                <th className="px-2 py-1.5">姓名</th>
                <th className="px-2 py-1.5">结果</th>
                <th className="px-2 py-1.5">比对图片</th>
                <th className="px-2 py-1.5">触发原因</th>
                <th className="px-2 py-1.5">详情</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.logSource ?? "twin"}-${r.id}`} className="border-b align-top hover:bg-[var(--twin-canvas-soft)]">
                  <td className="px-2 py-1.5 whitespace-nowrap">{toTime(r.eventTime)}</td>
                  <td className="px-2 py-1.5">
                    <div>{r.automationTypeLabel || r.automationType || "-"}</div>
                    {r.automationTypeLabel && <div className="font-mono text-[10px] text-[var(--twin-mute)]">{r.automationType}</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <div>{r.triggerTypeLabel || r.triggerType || "-"}</div>
                    {r.triggerTypeLabel && <div className="font-mono text-[10px] text-[var(--twin-mute)]">{r.triggerType}</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <div>{r.eventKeyLabel || r.eventKey || "-"}</div>
                    {r.eventKeyLabel && <div className="font-mono text-[10px] text-[var(--twin-mute)]">{r.eventKey}</div>}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">{r.userId || "-"}</td>
                  <td className="px-2 py-1.5">{r.userName || "-"}</td>
                  <td className="px-2 py-1.5">
                    {r.success === 1 ? <span className="text-emerald-600">成功</span> : <span className="text-rose-600">失败</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.automationType === "FACE_VERIFY" || r.logSource === "face" ? (
                      <FaceCompareImages row={r} />
                    ) : (
                      <span className="text-[var(--twin-mute)]">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <div>{r.triggerReasonLabel || r.triggerReason || "-"}</div>
                    {r.triggerReasonLabel && <div className="font-mono text-[10px] text-[var(--twin-mute)]">{r.triggerReason}</div>}
                  </td>
                  <td className="max-w-[32rem] px-2 py-1.5 text-[var(--twin-body)]">
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
        </AdminTableShell>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-[var(--twin-mute)]">
            共 {total} 条 · 每页 {PAGE_SIZE} 条 · 按时间倒序
          </span>
          <div className="flex items-center gap-2">
          <AdminButton type="button" tone="secondary" size="sm" disabled={page <= 1 || isLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            上一页
          </AdminButton>
          <span className="text-[var(--twin-body)]">
            {page} / {totalPages}
          </span>
          <AdminButton type="button" tone="secondary" size="sm" disabled={page >= totalPages || isLoading} onClick={() => setPage((p) => p + 1)}>
            下一页
          </AdminButton>
          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}
