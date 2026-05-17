import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FileText } from "lucide-react";
import { fetchAutomationLogs, type AutomationLogRow } from "@/api/twinApi";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { adminHintClass } from "@/features/admin/adminFormUi";
import { detailTextToLines } from "@/utils/detailTextToLines";

const TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "AUTO_SIGNOUT", label: "离开自动化" },
  { value: "SCHEDULER", label: "定时器自动化" },
  { value: "EXEMPTION", label: "豁免自动化" },
];

const TRIGGER_OPTIONS = [
  { value: "", label: "全部触发方式" },
  { value: "TIMER", label: "定时触发" },
  { value: "MANUAL", label: "手动触发" },
  { value: "SYSTEM", label: "系统触发" },
];

function toTime(value?: string) {
  if (!value) return "-";
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return value;
  return t.toLocaleString("zh-CN", { hour12: false });
}

function toApiTime(value: string, tail: "00:00:00" | "23:59:59") {
  if (!value) return "";
  return `${value} ${tail}`;
}

const PAGE_SIZE = 50;

const compactInputClass =
  "h-8 min-w-0 w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus-visible:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25";

const compactSelectClass = "h-8 min-w-0 w-full px-2 text-xs";

export default function AdminAutomationLogsPage() {
  const [rows, setRows] = useState<AutomationLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = PAGE_SIZE;
  const [total, setTotal] = useState(0);
  const [automationType, setAutomationType] = useState("");
  const [triggerType, setTriggerType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  /** 关闭时隐藏 ARO 穿甲轮询（ARO_PENETRATION_POLL）定时任务日志，便于只看门禁联动 */
  const [showPenetrationLogs, setShowPenetrationLogs] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  const load = async (targetPage = page, penetrationVisible?: boolean) => {
    setLoading(true);
    const showPen = penetrationVisible !== undefined ? penetrationVisible : showPenetrationLogs;
    try {
      const data = await fetchAutomationLogs({
        page: targetPage,
        pageSize,
        automationType: automationType || undefined,
        triggerType: triggerType || undefined,
        keyword: keyword.trim() || undefined,
        startTime: startDate ? toApiTime(startDate, "00:00:00") : undefined,
        endTime: endDate ? toApiTime(endDate, "23:59:59") : undefined,
        excludePenetrationPoll: !showPen,
      });
      setRows(data.list || []);
      setTotal(data.total || 0);
      setPage(data.page || targetPage);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "自动化日志加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <FileText className="h-6 w-6 shrink-0 text-[#0070f3]" aria-hidden />
          自动化日志
        </span>
      }
      description="查看门禁联动、定时任务等自动化执行流水；可按类型、触发方式与时间筛选。"
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
              <AdminButton type="button" tone="primary" size="sm" className="h-8 px-3 text-xs" onClick={() => void load(1)}>
                筛选
              </AdminButton>
              <AdminButton
                type="button"
                tone="secondary"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => {
                  setAutomationType("");
                  setTriggerType("");
                  setKeyword("");
                  setStartDate("");
                  setEndDate("");
                  setShowPenetrationLogs(false);
                  void load(1, false);
                }}
              >
                重置
              </AdminButton>
            </div>
            <label className={`flex shrink-0 cursor-pointer items-center gap-1.5 self-end whitespace-nowrap pb-1 ${adminHintClass}`}>
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-neutral-300"
                checked={showPenetrationLogs}
                onChange={(e) => {
                  const v = e.target.checked;
                  setShowPenetrationLogs(v);
                  void load(1, v);
                }}
              />
              穿甲轮询日志
            </label>
          </div>
        </AdminFormCard>

        <AdminTableShell
          loading={loading}
          empty={!loading && rows.length === 0}
          emptyMessage="暂无日志"
          scrollable
          className="[&_.admin-table-shell-inner]:max-h-[min(82vh,920px)]"
        >
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-600">
                <th className="px-2 py-1.5">时间</th>
                <th className="px-2 py-1.5">类型</th>
                <th className="px-2 py-1.5">触发方式</th>
                <th className="px-2 py-1.5">事件名称</th>
                <th className="px-2 py-1.5">用户ID</th>
                <th className="px-2 py-1.5">姓名</th>
                <th className="px-2 py-1.5">结果</th>
                <th className="px-2 py-1.5">触发原因</th>
                <th className="px-2 py-1.5">详情</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b align-top hover:bg-slate-50">
                  <td className="px-2 py-1.5 whitespace-nowrap">{toTime(r.eventTime)}</td>
                  <td className="px-2 py-1.5">
                    <div>{r.automationTypeLabel || r.automationType || "-"}</div>
                    {r.automationTypeLabel && <div className="font-mono text-[10px] text-slate-400">{r.automationType}</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <div>{r.triggerTypeLabel || r.triggerType || "-"}</div>
                    {r.triggerTypeLabel && <div className="font-mono text-[10px] text-slate-400">{r.triggerType}</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <div>{r.eventKeyLabel || r.eventKey || "-"}</div>
                    {r.eventKeyLabel && <div className="font-mono text-[10px] text-slate-400">{r.eventKey}</div>}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">{r.userId || "-"}</td>
                  <td className="px-2 py-1.5">{r.userName || "-"}</td>
                  <td className="px-2 py-1.5">
                    {r.success === 1 ? <span className="text-emerald-600">成功</span> : <span className="text-rose-600">失败</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <div>{r.triggerReasonLabel || r.triggerReason || "-"}</div>
                    {r.triggerReasonLabel && <div className="font-mono text-[10px] text-slate-400">{r.triggerReason}</div>}
                  </td>
                  <td className="max-w-[32rem] px-2 py-1.5 text-slate-700">
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
          <span className="text-neutral-500">
            共 {total} 条 · 每页 {pageSize} 条 · 按时间倒序
          </span>
          <div className="flex items-center gap-2">
          <AdminButton type="button" tone="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>
            上一页
          </AdminButton>
          <span className="text-neutral-600">
            {page} / {totalPages}
          </span>
          <AdminButton type="button" tone="secondary" size="sm" disabled={page >= totalPages || loading} onClick={() => void load(page + 1)}>
            下一页
          </AdminButton>
          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}
