import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { fetchAutomationLogs, type AutomationLogRow } from "@/api/twinApi";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";
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

export default function AdminAutomationLogsPage() {
  const [rows, setRows] = useState<AutomationLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
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
    } catch (e: any) {
      toast.error(e?.message || "自动化日志加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 text-base font-semibold text-slate-800">自动化日志</div>
        <div className="grid gap-2 md:grid-cols-6">
          <select value={automationType} onChange={(e) => setAutomationType(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
            {TRIGGER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="用户ID/姓名/原因/事件关键词" className="rounded-md border px-3 py-2 text-sm" />
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button onClick={() => void load(1)} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">筛选</button>
            <button
              onClick={() => {
                setAutomationType("");
                setTriggerType("");
                setKeyword("");
                setStartDate("");
                setEndDate("");
                setShowPenetrationLogs(false);
                void load(1, false);
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              重置
            </button>
          </div>
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={showPenetrationLogs}
            onChange={(e) => {
              const v = e.target.checked;
              setShowPenetrationLogs(v);
              void load(1, v);
            }}
          />
          显示穿甲轮询等后台任务日志（ARO_PENETRATION_POLL）
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-slate-600">共 {total} 条，按时间倒序</div>
          {loading && <div className="text-xs text-slate-500">加载中...</div>}
        </div>
        <AdminDataTableWrap scrollable className="rounded-none border-0 bg-transparent shadow-none ring-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-600">
                <th className="px-2 py-2">时间</th>
                <th className="px-2 py-2">类型</th>
                <th className="px-2 py-2">触发方式</th>
                <th className="px-2 py-2">事件名称</th>
                <th className="px-2 py-2">用户ID</th>
                <th className="px-2 py-2">姓名</th>
                <th className="px-2 py-2">结果</th>
                <th className="px-2 py-2">触发原因</th>
                <th className="px-2 py-2">详情</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b align-top hover:bg-slate-50">
                  <td className="px-2 py-2 whitespace-nowrap">{toTime(r.eventTime)}</td>
                  <td className="px-2 py-2">
                    <div>{r.automationTypeLabel || r.automationType || "-"}</div>
                    {r.automationTypeLabel && <div className="text-[10px] text-slate-400 font-mono">{r.automationType}</div>}
                  </td>
                  <td className="px-2 py-2">
                    <div>{r.triggerTypeLabel || r.triggerType || "-"}</div>
                    {r.triggerTypeLabel && <div className="text-[10px] text-slate-400 font-mono">{r.triggerType}</div>}
                  </td>
                  <td className="px-2 py-2">
                    <div>{r.eventKeyLabel || r.eventKey || "-"}</div>
                    {r.eventKeyLabel && <div className="text-[10px] text-slate-400 font-mono">{r.eventKey}</div>}
                  </td>
                  <td className="px-2 py-2 font-mono text-xs">{r.userId || "-"}</td>
                  <td className="px-2 py-2">{r.userName || "-"}</td>
                  <td className="px-2 py-2">{r.success === 1 ? <span className="text-emerald-600">成功</span> : <span className="text-rose-600">失败</span>}</td>
                  <td className="px-2 py-2">
                    <div>{r.triggerReasonLabel || r.triggerReason || "-"}</div>
                    {r.triggerReasonLabel && <div className="text-[10px] text-slate-400 font-mono">{r.triggerReason}</div>}
                  </td>
                  <td className="max-w-[32rem] px-2 py-2 text-slate-700">
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
              {!rows.length && !loading && (
                <tr>
                  <td className="px-2 py-8 text-center text-slate-500" colSpan={9}>暂无日志</td>
                </tr>
              )}
            </tbody>
          </table>
        </AdminDataTableWrap>
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button
            disabled={page <= 1 || loading}
            onClick={() => void load(page - 1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            上一页
          </button>
          <span className="text-slate-600">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => void load(page + 1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
