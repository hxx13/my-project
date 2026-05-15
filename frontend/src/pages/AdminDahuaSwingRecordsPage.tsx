import { useEffect, useState } from "react";
import { listDahuaSwingRecords, listDahuaSwingTasks, type DahuaSwingRecord, type DahuaSwingTask } from "@/api/domains/dahuaSwing.api";
import toast from "react-hot-toast";
import { fetchDahuaDeviceChannels, searchCardMappings, type CardMappingRow, type DahuaDeviceChannelRow } from "@/api/twinApi";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";

const OPEN_TYPE_OPTIONS = [
  { code: 51, name: "合法刷卡开门" },
  { code: 52, name: "非法刷卡开门" },
  { code: 48, name: "远程开门" },
  { code: 49, name: "按钮开门" },
];

const toDateTimeLocal = (v: string) => v.replace(" ", "T").slice(0, 16);
const toApiDateTime = (v: string) => (v ? `${v.replace("T", " ")}:00` : "");
const todayRange = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return {
    start: `${y}-${m}-${d}T00:00`,
    end: `${y}-${m}-${d}T23:59`,
  };
};

export default function AdminDahuaSwingRecordsPage() {
  const today = todayRange();
  const [tasks, setTasks] = useState<DahuaSwingTask[]>([]);
  const [rows, setRows] = useState<DahuaSwingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const [channelKeyword, setChannelKeyword] = useState("");
  const [channelOptions, setChannelOptions] = useState<DahuaDeviceChannelRow[]>([]);
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);
  const [personKeyword, setPersonKeyword] = useState("");
  const [personOptions, setPersonOptions] = useState<CardMappingRow[]>([]);
  const [personDropdownOpen, setPersonDropdownOpen] = useState(false);
  const [filters, setFilters] = useState({
    taskId: "",
    channelCode: "",
    personCode: "",
    personName: "",
    openType: "",
    startTime: today.start,
    endTime: today.end,
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await listDahuaSwingRecords({
        taskId: filters.taskId ? Number(filters.taskId) : undefined,
        channelCode: filters.channelCode || undefined,
        personCode: filters.personCode || undefined,
        personName: filters.personName || undefined,
        openType: filters.openType ? Number(filters.openType) : undefined,
        startTime: filters.startTime ? toApiDateTime(filters.startTime) : undefined,
        endTime: filters.endTime ? toApiDateTime(filters.endTime) : undefined,
        page,
        size: pageSize,
      });
      setRows(res.data || []);
      setTotal(res.total || 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page]);

  useEffect(() => {
    void (async () => {
      setTasks(await listDahuaSwingTasks());
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchDahuaDeviceChannels({ page: 1, pageSize: 100, keyword: channelKeyword.trim() });
        setChannelOptions(res.list || []);
      } catch {
        setChannelOptions([]);
      }
    })();
  }, [channelKeyword]);

  useEffect(() => {
    const kw = personKeyword.trim();
    if (!kw) {
      setPersonOptions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        setPersonOptions(await searchCardMappings(kw));
      } catch {
        setPersonOptions([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [personKeyword]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold text-slate-800">门禁记录库</h1>
      <div className="rounded-xl border bg-white p-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-slate-600 min-w-[120px]">
          任务范围
          <select className="h-9 rounded border px-2 text-xs" value={filters.taskId} onChange={(e) => setFilters((p) => ({ ...p, taskId: e.target.value }))}>
            <option value="">全部任务</option>
            {tasks.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] text-slate-600 min-w-[220px]">
          通道筛选（名称/编码）
          <div className="relative">
            <div className="flex h-9 items-center rounded border">
              <input
                className="flex-1 px-2 text-xs outline-none"
                placeholder="全部通道（输入关键字筛选）"
                value={channelKeyword}
                onChange={(e) => {
                  setChannelKeyword(e.target.value);
                  setChannelDropdownOpen(true);
                }}
                onFocus={() => setChannelDropdownOpen(true)}
              />
              <button
                type="button"
                className="h-full px-2 text-slate-500 hover:text-slate-800"
                onClick={() => setChannelDropdownOpen((v) => !v)}
                aria-label="展开通道列表"
              >
                ▾
              </button>
            </div>
            {channelDropdownOpen && (
              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded border bg-white shadow">
                <button
                  type="button"
                  className={`block w-full px-2 py-2 text-left text-xs hover:bg-slate-50 ${filters.channelCode === "" ? "bg-indigo-50 text-indigo-700" : ""}`}
                  onClick={() => {
                    setFilters((p) => ({ ...p, channelCode: "" }));
                    setChannelDropdownOpen(false);
                  }}
                >
                  全部通道
                </button>
                {channelOptions.map((ch) => {
                  const code = (ch.channelCode || "").trim();
                  if (!code) return null;
                  const label = (ch.channelName || "未命名通道") + " / " + code;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      className={`block w-full px-2 py-2 text-left text-xs hover:bg-slate-50 ${filters.channelCode === code ? "bg-indigo-50 text-indigo-700" : ""}`}
                      onClick={() => {
                        setFilters((p) => ({ ...p, channelCode: code }));
                        setChannelKeyword(label);
                        setChannelDropdownOpen(false);
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </label>

        <label className="flex flex-col gap-1 text-[11px] text-slate-600 min-w-[140px]">
          开门类型
          <select className="h-9 rounded border px-2 text-xs" value={filters.openType} onChange={(e) => setFilters((p) => ({ ...p, openType: e.target.value }))}>
            <option value="">全部开门类型</option>
            {OPEN_TYPE_OPTIONS.map((it) => <option key={it.code} value={it.code}>{it.name}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] text-slate-600 min-w-[240px]">
          人员筛选（姓名/编号一体）
          <div className="relative">
            <div className="flex h-9 items-center rounded border">
              <input
                className="flex-1 px-2 text-xs outline-none"
                placeholder="全部人员（输入姓名/编号搜索）"
                value={personKeyword}
                onChange={(e) => {
                  setPersonKeyword(e.target.value);
                  setPersonDropdownOpen(true);
                }}
                onFocus={() => setPersonDropdownOpen(true)}
              />
              <button
                type="button"
                className="h-full px-2 text-slate-500 hover:text-slate-800"
                onClick={() => setPersonDropdownOpen((v) => !v)}
                aria-label="展开人员列表"
              >
                ▾
              </button>
            </div>
            {personDropdownOpen && (
              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded border bg-white shadow">
                <button
                  type="button"
                  className={`block w-full px-2 py-2 text-left text-xs hover:bg-slate-50 ${filters.personCode === "" ? "bg-indigo-50 text-indigo-700" : ""}`}
                  onClick={() => {
                    setFilters((p) => ({ ...p, personCode: "", personName: "" }));
                    setPersonKeyword("");
                    setPersonDropdownOpen(false);
                  }}
                >
                  全部人员
                </button>
                {personOptions.map((p) => {
                  const code = p.aroUserId || "";
                  const name = p.userName || "未知";
                  const label = `${name} / ${code || "-"}`;
                  return (
                    <button
                      key={`${p.aroUserId}-${p.cardNo}`}
                      type="button"
                      className={`block w-full px-2 py-2 text-left text-xs hover:bg-slate-50 ${filters.personCode === code ? "bg-indigo-50 text-indigo-700" : ""}`}
                      onClick={() => {
                        setFilters((f) => ({ ...f, personCode: code, personName: name }));
                        setPersonKeyword(label);
                        setPersonDropdownOpen(false);
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </label>

        <div className="rounded border p-2 min-w-[360px]">
          <div className="mb-1 text-[11px] text-slate-600">起止时间（默认今天）</div>
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <input type="datetime-local" className="h-9 rounded border px-2 text-xs" value={filters.startTime} onChange={(e) => setFilters((p) => ({ ...p, startTime: e.target.value }))} />
            <input type="datetime-local" className="h-9 rounded border px-2 text-xs" value={filters.endTime} onChange={(e) => setFilters((p) => ({ ...p, endTime: e.target.value }))} />
            <button
              type="button"
              className="h-9 rounded border px-2 text-[11px] text-slate-600 hover:bg-slate-50"
              onClick={() => {
                const t = todayRange();
                setFilters((p) => ({ ...p, startTime: t.start, endTime: t.end }));
              }}
            >
              今天
            </button>
          </div>
        </div>

        <div className="ml-auto">
          <button
            type="button"
            className="h-9 rounded bg-slate-900 px-4 text-xs text-white"
            onClick={async () => {
              setPage(1);
              await load();
            }}
          >
            查询
          </button>
        </div>
      </div>

      <AdminDataTableWrap scrollable>
        <table className="w-full min-w-[980px] text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">刷卡时间</th>
              <th className="px-3 py-2 text-left">通道</th>
              <th className="px-3 py-2 text-left">人员</th>
              <th className="px-3 py-2 text-left">卡号</th>
              <th className="px-3 py-2 text-left">开门类型</th>
              <th className="px-3 py-2 text-left">映射</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-6 text-center text-slate-400" colSpan={7}>加载中...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-3 py-6 text-center text-slate-400" colSpan={7}>无数据</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={`${r.recordId}-${r.id}`} className="border-t">
                  <td className="px-3 py-2">{r.swingTime ? toDateTimeLocal(r.swingTime).replace("T", " ") : "-"}</td>
                  <td className="px-3 py-2">{r.channelName || r.channelCode || "-"}</td>
                  <td className="px-3 py-2">{r.personName || "-"} ({r.personCode || "-"})</td>
                  <td className="px-3 py-2">{r.cardNumber || "-"}</td>
                  <td className="px-3 py-2">{OPEN_TYPE_OPTIONS.find((x) => x.code === r.openType)?.name || (r.openType ?? "-")}</td>
                  <td className="px-3 py-2">{r.mappingHit === 1 ? "已映射" : "未映射"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </AdminDataTableWrap>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <div>总计 {total} 条</div>
        <div className="space-x-2">
          <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
          <span>第 {page} 页</span>
          <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>下一页</button>
        </div>
      </div>
    </div>
  );
}
