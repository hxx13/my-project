import { useEffect, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { normalizeChannelCode, resolveChannelLabelsByCodes } from "@/utils/dahuaChannelUtils";
import {
  createDahuaSwingTask,
  deleteDahuaSwingTask,
  executeAllDahuaSwingTask,
  executeDahuaSwingTask,
  listDahuaSwingTasks,
  type DahuaSwingTask,
  updateDahuaSwingTask,
} from "@/api/domains/dahuaSwing.api";
import {
  fetchCardMappings,
  fetchDahuaDepartments,
  fetchDahuaDeviceChannels,
  searchCardMappings,
  type CardMappingRow,
  type DahuaDepartmentRow,
  type DahuaDeviceChannelRow,
} from "@/api/twinApi";

type TaskUiForm = {
  id?: number;
  name: string;
  enabled: number;
  pollIntervalSeconds: number;
  pageSize: number;
  queryWindowMinutes: number;
  channelCodes: string[];
  exitChannelCodes: string[];
  toggleChannelCodes: string[];
  deptIds: string;
  personCode: string;
  personName: string;
  openType: number | "";
  cardNumber: string;
  enterOrExit: number | "";
  openResult: number | "";
  mode: "EXIT_ONLY" | "TOGGLE_IN_OUT";
  autoExitDelaySeconds: number;
  enterDebounceSeconds: number;
  activationExpireSeconds: number;
  requireOtherRoomSuccess: boolean;
  otherRoomWithinSeconds: number;
};

const defaultForm = (): TaskUiForm => ({
  name: "",
  enabled: 0,
  pollIntervalSeconds: 60,
  pageSize: 200,
  queryWindowMinutes: 30,
  channelCodes: [],
  exitChannelCodes: [],
  toggleChannelCodes: [],
  deptIds: "",
  personCode: "",
  personName: "",
  openType: "",
  cardNumber: "",
  enterOrExit: "",
  openResult: "",
  mode: "EXIT_ONLY",
  autoExitDelaySeconds: 10,
  enterDebounceSeconds: 30,
  activationExpireSeconds: 120,
  requireOtherRoomSuccess: true,
  otherRoomWithinSeconds: 120,
});

const OPEN_TYPE_OPTIONS = [
  { code: 51, name: "合法刷卡开门" },
  { code: 52, name: "非法刷卡开门" },
  { code: 48, name: "远程开门" },
  { code: 49, name: "按钮开门" },
];

export default function AdminDahuaSwingTasksPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DahuaSwingTask[]>([]);
  const [form, setForm] = useState<TaskUiForm>(defaultForm());
  const [taskChannelKeyword, setTaskChannelKeyword] = useState("");
  const [taskChannelOptions, setTaskChannelOptions] = useState<DahuaDeviceChannelRow[]>([]);
  const [deptKeyword, setDeptKeyword] = useState("");
  const [deptOptions, setDeptOptions] = useState<DahuaDepartmentRow[]>([]);
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const [expandedDeptIds, setExpandedDeptIds] = useState<Set<number>>(new Set());
  const [cardKeyword, setCardKeyword] = useState("");
  const [cardOptions, setCardOptions] = useState<CardMappingRow[]>([]);
  const [cardDropdownOpen, setCardDropdownOpen] = useState(false);
  const [editingHintName, setEditingHintName] = useState("");
  const [taskChannelLabelExtra, setTaskChannelLabelExtra] = useState<Record<string, string>>({});

  const departmentTreeGrouped = useMemo(() => {
    const childrenMap = new Map<number, DahuaDepartmentRow[]>();
    const byId = new Map<number, DahuaDepartmentRow>();
    for (const d of deptOptions) {
      if (typeof d?.id === "number") byId.set(d.id, d);
    }
    for (const d of deptOptions) {
      const pid = typeof d.parentId === "number" ? d.parentId : 0;
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid)!.push(d);
    }
    const roots = deptOptions.filter((d) => {
      if (typeof d?.id !== "number") return false;
      if (typeof d.parentId !== "number") return true;
      return !byId.has(d.parentId);
    });
    return { roots, childrenMap };
  }, [deptOptions]);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listDahuaSwingTasks());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载任务失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);


  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetchDahuaDeviceChannels({ page: 1, pageSize: 200, keyword: taskChannelKeyword.trim() });
        setTaskChannelOptions(res.list || []);
      } catch {
        setTaskChannelOptions([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [taskChannelKeyword]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchDahuaDepartments(1, 200, deptKeyword.trim());
        setDeptOptions(res.list || []);
      } catch {
        setDeptOptions([]);
      }
    })();
  }, [deptKeyword]);

  useEffect(() => {
    const rootIds = new Set<number>();
    for (const node of departmentTreeGrouped.roots) {
      if (typeof node.id === "number") rootIds.add(node.id);
    }
    setExpandedDeptIds(rootIds);
  }, [departmentTreeGrouped]);

  useEffect(() => {
    const kw = cardKeyword.trim();
    const timer = window.setTimeout(async () => {
      try {
        if (!kw) {
          const res = await fetchCardMappings(1, 200);
          setCardOptions(res.list || []);
        } else {
          setCardOptions(await searchCardMappings(kw));
        }
      } catch {
        setCardOptions([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [cardKeyword]);

  const taskChannelLabelByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const ch of taskChannelOptions) {
      const code = normalizeChannelCode(ch.channelCode);
      if (!code) continue;
      const name = (ch.channelName || "").trim();
      m.set(code, name || `未命名 / ${code}`);
    }
    for (const [k, v] of Object.entries(taskChannelLabelExtra)) {
      if (k && !m.has(k)) m.set(k, v);
    }
    return m;
  }, [taskChannelOptions, taskChannelLabelExtra]);

  useEffect(() => {
    const codes = form.channelCodes.map(normalizeChannelCode).filter(Boolean);
    const known = new Set(
      taskChannelOptions.map((ch) => normalizeChannelCode(ch.channelCode)).filter(Boolean)
    );
    const need = [...new Set(codes)].filter((c) => !known.has(c));
    if (need.length === 0) return;
    void (async () => {
      const resolved = await resolveChannelLabelsByCodes(need, fetchDahuaDeviceChannels);
      setTaskChannelLabelExtra((prev) => ({ ...prev, ...resolved }));
    })();
  }, [form.channelCodes, taskChannelOptions]);

  const toTaskPayload = (ui: TaskUiForm): DahuaSwingTask => {
    const query = {
      pageSize: ui.pageSize,
      queryWindowMinutes: Math.max(1, Number(ui.queryWindowMinutes || 30)),
      channelCodes: ui.channelCodes.map(normalizeChannelCode).filter(Boolean),
      deptIds: ui.deptIds || undefined,
      personCode: ui.personCode || undefined,
      personName: ui.personName || undefined,
      openType: ui.openType === "" ? undefined : ui.openType,
      cardNumber: ui.cardNumber || undefined,
      enterOrExit: ui.enterOrExit === "" ? undefined : ui.enterOrExit,
      openResult: ui.openResult === "" ? undefined : ui.openResult,
    };
    return {
      id: ui.id,
      name: ui.name,
      enabled: ui.enabled,
      pollIntervalSeconds: ui.pollIntervalSeconds,
      queryJson: JSON.stringify(query),
      activationRulesJson: undefined,
    };
  };


  const fromTaskPayload = (t: DahuaSwingTask): TaskUiForm => {
    let query: Record<string, any> = {};
    try {
      query = t.queryJson ? JSON.parse(t.queryJson) : {};
    } catch {
      query = {};
    }
    return {
      id: t.id,
      name: t.name || "",
      enabled: t.enabled ?? 1,
      pollIntervalSeconds: Number(t.pollIntervalSeconds || 60),
      pageSize: Number(query.pageSize || 200),
      queryWindowMinutes: Number(query.queryWindowMinutes || 30),
      channelCodes: Array.isArray(query.channelCodes)
        ? query.channelCodes.map((x: any) => normalizeChannelCode(String(x))).filter(Boolean)
        : [],
      exitChannelCodes: [],
      toggleChannelCodes: [],
      deptIds: String(query.deptIds || ""),
      personCode: String(query.personCode || ""),
      personName: String(query.personName || ""),
      openType: query.openType == null ? "" : Number(query.openType),
      cardNumber: String(query.cardNumber || ""),
      enterOrExit: query.enterOrExit == null ? "" : Number(query.enterOrExit),
      openResult: query.openResult == null ? "" : Number(query.openResult),
      mode: "EXIT_ONLY",
      autoExitDelaySeconds: 10,
      enterDebounceSeconds: 30,
      activationExpireSeconds: 120,
      requireOtherRoomSuccess: true,
      otherRoomWithinSeconds: 120,
    };
  };

  const save = async () => {
    try {
      if (!form.name.trim()) return toast.error("任务名不能为空");
      if (
        form.channelCodes.length === 0 &&
        !form.deptIds.trim() &&
        !form.personCode.trim() &&
        !form.personName.trim() &&
        form.openType === "" &&
        !form.cardNumber.trim() &&
        form.enterOrExit === "" &&
        form.openResult === ""
      ) {
        return toast.error("至少配置一个筛选条件");
      }
      const payload = toTaskPayload(form);
      if (form.id) await updateDahuaSwingTask(form.id, payload);
      else await createDahuaSwingTask(payload);
      toast.success("保存成功");
      setEditingHintName("");
      setTaskChannelLabelExtra({});
      setForm(defaultForm());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };


  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">大华门禁拉取任务</h1>
        <button
          type="button"
          className="h-9 rounded bg-slate-900 px-3 text-xs text-white"
          onClick={async () => {
            try {
              const res = await executeAllDahuaSwingTask();
              const ok = res?.ok || 0;
              const fail = res?.fail || 0;
              toast.success(`执行完成：成功 ${ok}，失败 ${fail}`);
              if (fail > 0 && Array.isArray(res?.failDetails) && res.failDetails.length > 0) {
                const text = res.failDetails
                  .slice(0, 3)
                  .map((x) => `${x.taskName || `任务#${x.taskId || "-"}`}: ${x.reason || "未知错误"}`)
                  .join("；");
                toast.error(`失败详情：${text}${res.failDetails.length > 3 ? "；..." : ""}`);
              }
              await load();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "执行失败");
            }
          }}
        >
          执行全部启用任务
        </button>
      </div>

      <div className="rounded-xl border bg-white p-3 space-y-2">
        {form.id && (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            当前为编辑模式：正在修改任务
            <span className="ml-1 font-semibold">{editingHintName || form.name || `#${form.id}`}</span>
            <span className="ml-2 text-amber-700">（修改后请点击“更新任务”保存）</span>
          </div>
        )}
        <label className="flex flex-col gap-1 text-[11px] text-slate-600">
          任务名称（用于区分不同拉取规则）
          <input
            className="h-8 w-full max-w-[420px] rounded border px-2 text-[11px]"
            placeholder="例如：浦东-1号门-自动签退"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </label>
        <label className="text-xs text-slate-700 inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.enabled === 1}
            onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked ? 1 : 0 }))}
          />
          启用任务（开启后可被批量执行）
        </label>
        <div className="grid gap-1.5 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            轮询频率（秒）
            <input
              className="h-8 rounded border px-2 text-[11px]"
              placeholder="例如 60"
              type="number"
              value={form.pollIntervalSeconds}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  pollIntervalSeconds: e.target.value === "" ? 0 : Number(e.target.value),
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            分页大小（每次请求条数）
            <input
              className="h-8 rounded border px-2 text-[11px]"
              placeholder="pageSize"
              type="number"
              value={form.pageSize}
              onChange={(e) => setForm((p) => ({ ...p, pageSize: Math.max(1, Number(e.target.value || 200)) }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            拉取动态窗口（分钟）
            <input
              className="h-8 rounded border px-2 text-[11px]"
              placeholder="默认30，仅拉取当前时间之前N分钟"
              type="number"
              min={1}
              value={form.queryWindowMinutes}
              onChange={(e) => setForm((p) => ({ ...p, queryWindowMinutes: Number(e.target.value || 30) }))}
            />
          </label>
          <div className="flex flex-col gap-1 text-[11px] text-slate-600">
            部门ID（下拉选择）
            <div className="relative">
              <div className="flex h-8 items-center rounded border">
                <input
                  className="flex-1 px-2 text-[11px] outline-none"
                  placeholder="全部部门（输入名称/ID搜索）"
                  value={deptKeyword}
                  onChange={(e) => {
                    setDeptKeyword(e.target.value);
                    setDeptDropdownOpen(true);
                  }}
                  onFocus={() => setDeptDropdownOpen(true)}
                />
                <button
                  type="button"
                  className="h-full px-2 text-slate-500 hover:text-slate-800"
                  onClick={() => setDeptDropdownOpen((v) => !v)}
                  aria-label="展开部门列表"
                >
                  ▾
                </button>
              </div>
              {deptDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full rounded border bg-white p-2 shadow">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[11px] text-slate-500">
                      已选部门ID：{form.deptIds || ""}
                    </div>
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
                      onClick={async () => {
                        try {
                          const res = await fetchDahuaDepartments(1, 200, deptKeyword.trim());
                          setDeptOptions(res.list || []);
                        } catch {
                          setDeptOptions([]);
                        }
                      }}
                    >
                      刷新
                    </button>
                  </div>

                  <div className="max-h-56 overflow-auto rounded border border-slate-200 bg-white p-1">
                    <button
                      type="button"
                      className={`mb-1 block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50 ${form.deptIds === "" ? "bg-indigo-50 text-indigo-700" : "text-slate-700"}`}
                      onClick={() => {
                        setForm((p) => ({ ...p, deptIds: "" }));
                        setDeptKeyword("");
                        setDeptDropdownOpen(false);
                      }}
                    >
                      全部部门
                    </button>
                    {departmentTreeGrouped.roots.map((root) => {
                      const renderNode = (node: DahuaDepartmentRow, depth: number): ReactNode => {
                        const nodeId = Number(node.id);
                        if (!Number.isFinite(nodeId)) return null;
                        const children = departmentTreeGrouped.childrenMap.get(nodeId) || [];
                        const open = expandedDeptIds.has(nodeId);
                        const checked = String(nodeId) === form.deptIds;
                        const deptName = (node.name || node.deptName || `部门${nodeId}`).trim();
                        const label = `${deptName} / ${nodeId}`;
                        return (
                          <div key={nodeId} className="mb-0.5">
                            <div
                              className={`flex items-center gap-1 rounded px-1 py-1 text-xs ${checked ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50"}`}
                              style={{ marginLeft: `${depth * 14}px` }}
                            >
                              {children.length > 0 ? (
                                <button
                                  type="button"
                                  className="h-5 w-5 rounded border border-slate-200 text-[10px] hover:bg-slate-100"
                                  onClick={() =>
                                    setExpandedDeptIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(nodeId)) next.delete(nodeId);
                                      else next.add(nodeId);
                                      return next;
                                    })
                                  }
                                >
                                  {open ? "▾" : "▸"}
                                </button>
                              ) : (
                                <span className="inline-block h-5 w-5" />
                              )}
                              <input
                                type="radio"
                                name="task-dept-id"
                                checked={checked}
                                onChange={() => {
                                  setForm((p) => ({ ...p, deptIds: String(nodeId) }));
                                  setDeptKeyword(label);
                                  setDeptDropdownOpen(false);
                                }}
                              />
                              <span className="truncate">{depth > 0 ? "└ " : ""}{deptName}</span>
                              <span className="text-[10px] text-slate-400">#{nodeId}</span>
                            </div>
                            {open && children.length > 0 && (
                              <div>{children.map((child) => renderNode(child, depth + 1))}</div>
                            )}
                          </div>
                        );
                      };
                      return renderNode(root, 0);
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1 text-[11px] text-slate-600">
            卡号（从大华发卡库下拉选择）
            <div className="relative">
              <div className="flex h-8 items-center rounded border">
                <input
                  className="flex-1 px-2 text-[11px] outline-none"
                  placeholder="全部卡号（输入卡号/姓名/编号搜索）"
                  value={cardKeyword}
                  onChange={(e) => {
                    setCardKeyword(e.target.value);
                    setCardDropdownOpen(true);
                  }}
                  onFocus={() => setCardDropdownOpen(true)}
                />
                <button
                  type="button"
                  className="h-full px-2 text-slate-500 hover:text-slate-800"
                  onClick={() => setCardDropdownOpen((v) => !v)}
                  aria-label="展开卡号列表"
                >
                  ▾
                </button>
              </div>
              {cardDropdownOpen && (
                <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded border bg-white shadow">
                  <button
                    type="button"
                    className={`block w-full px-2 py-2 text-left text-xs hover:bg-slate-50 ${form.cardNumber === "" ? "bg-indigo-50 text-indigo-700" : ""}`}
                    onClick={() => {
                      setForm((p) => ({ ...p, cardNumber: "" }));
                      setCardKeyword("");
                      setCardDropdownOpen(false);
                    }}
                  >
                    全部卡号
                  </button>
                  {cardOptions.map((c) => {
                    const cardNo = c.cardNo || "";
                    if (!cardNo) return null;
                    const label = `${cardNo} / ${c.userName || "未知"} / ${c.aroUserId || "-"}`;
                    return (
                      <button
                        key={`${c.cardNo}-${c.aroUserId}`}
                        type="button"
                        className={`block w-full px-2 py-2 text-left text-xs hover:bg-slate-50 ${form.cardNumber === cardNo ? "bg-indigo-50 text-indigo-700" : ""}`}
                        onClick={() => {
                          setForm((p) => ({ ...p, cardNumber: cardNo }));
                          setCardKeyword(label);
                          setCardDropdownOpen(false);
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            开门类型
            <select
              className="h-8 rounded border px-2 text-[11px]"
              value={form.openType}
              onChange={(e) => setForm((p) => ({ ...p, openType: e.target.value ? Number(e.target.value) : "" }))}
            >
              <option value="">全部开门类型</option>
              {OPEN_TYPE_OPTIONS.map((it) => (
                <option key={it.code} value={it.code}>{it.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            事件类型（进/出）
            <select
              className="h-8 rounded border px-2 text-[11px]"
              value={form.enterOrExit}
              onChange={(e) => setForm((p) => ({ ...p, enterOrExit: e.target.value ? Number(e.target.value) : "" }))}
            >
              <option value="">全部事件类型</option>
              <option value="1">进门</option>
              <option value="2">出门</option>
              <option value="3">进/出门</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-600">
            开门结果
            <select
              className="h-8 rounded border px-2 text-[11px]"
              value={form.openResult}
              onChange={(e) => setForm((p) => ({ ...p, openResult: e.target.value ? Number(e.target.value) : "" }))}
            >
              <option value="">全部开门结果</option>
              <option value="1">成功</option>
              <option value="0">失败</option>
            </select>
          </label>
        </div>

        <div className="rounded border p-2 space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-600">门禁通道筛选（任务拉取条件，可多选）</div>
          <input
            className="h-8 w-full max-w-[420px] rounded border px-2 text-[11px]"
            placeholder="搜索通道名称/编码"
            value={taskChannelKeyword}
            onChange={(e) => setTaskChannelKeyword(e.target.value)}
          />
          <div className="max-h-36 overflow-auto space-y-1 rounded border border-slate-100 p-1">
            {taskChannelOptions.map((ch) => {
              const code = normalizeChannelCode(ch.channelCode);
              if (!code) return null;
              const checked = form.channelCodes.some((c) => normalizeChannelCode(c) === code);
              return (
                <label key={`task-channel-${ch.id}`} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const on = e.target.checked;
                      const name = (ch.channelName || "").trim();
                      if (on) {
                        setTaskChannelLabelExtra((prev) => ({
                          ...prev,
                          [code]: name || `未命名 / ${code}`,
                        }));
                      }
                      setForm((p) => ({
                        ...p,
                        channelCodes: on
                          ? Array.from(new Set([...p.channelCodes.map(normalizeChannelCode).filter(Boolean), code]))
                          : p.channelCodes.filter((c) => normalizeChannelCode(c) !== code),
                      }));
                    }}
                  />
                  <span>{(ch.channelName || "未命名通道") + " / " + code}</span>
                </label>
              );
            })}
          </div>
          {form.channelCodes.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {form.channelCodes.map((code) => {
                const k = normalizeChannelCode(code);
                const label = taskChannelLabelByCode.get(k) || k;
                return (
                  <span
                    key={k}
                    title={k}
                    className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 max-w-[240px] truncate"
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button type="button" className="h-9 rounded bg-blue-600 px-3 text-xs text-white" onClick={() => void save()}>
            {form.id ? "更新任务" : "新建任务"}
          </button>
          {form.id && (
            <button
              type="button"
              className="h-9 rounded border px-3 text-xs"
              onClick={() => {
                setEditingHintName("");
                setTaskChannelLabelExtra({});
                setForm(defaultForm());
              }}
            >
              取消编辑
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">任务</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-left">最后执行</th>
              <th className="px-3 py-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-6 text-center text-slate-400" colSpan={4}>加载中...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-3 py-6 text-center text-slate-400" colSpan={4}>暂无任务</td></tr>
            ) : (
              rows.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="px-3 py-2">{it.name}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${it.enabled === 1 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {it.enabled === 1 ? "已启用" : "已停用"}
                    </span>
                    <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${it.lastStatus === "SUCCESS" ? "bg-blue-50 text-blue-700" : it.lastStatus === "FAILED" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                      {it.lastStatus || "-"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{it.lastRunAt || "-"}</td>
                  <td className="px-3 py-2 space-x-2">
                    <button
                      type="button"
                      className="text-blue-600"
                      onClick={() => {
                        const next = fromTaskPayload(it);
                        setForm(next);
                        setTaskChannelLabelExtra({});
                        setEditingHintName(it.name || "");
                        setDeptKeyword(next.deptIds || "");
                        setCardKeyword(next.cardNumber || "");
                        setTaskChannelKeyword("");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="text-indigo-600"
                      onClick={async () => {
                        try {
                          const res = await executeDahuaSwingTask(Number(it.id));
                          const windowText =
                            res?.pulledStartTime && res?.pulledEndTime
                              ? `，窗口 ${res.pulledStartTime} ~ ${res.pulledEndTime}`
                              : "";
                          toast.success(`执行成功，落库 ${res?.saved || 0} 条${windowText}`);
                          await load();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "执行失败");
                        }
                      }}
                    >
                      执行
                    </button>
                    {it.enabled === 1 ? (
                      <button
                        type="button"
                        className="text-amber-600"
                        onClick={async () => {
                          try {
                            await updateDahuaSwingTask(Number(it.id), {
                              ...it,
                              enabled: 0,
                            });
                            toast.success("任务已关闭");
                            await load();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "状态更新失败");
                          }
                        }}
                      >
                        关闭
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-emerald-600"
                        onClick={async () => {
                          try {
                            await updateDahuaSwingTask(Number(it.id), {
                              ...it,
                              enabled: 1,
                            });
                            toast.success("任务已启用");
                            await load();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "状态更新失败");
                          }
                        }}
                      >
                        启用
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-rose-600"
                      onClick={async () => {
                        if (!window.confirm("确定删除该任务吗？")) return;
                        await deleteDahuaSwingTask(Number(it.id));
                        await load();
                      }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
