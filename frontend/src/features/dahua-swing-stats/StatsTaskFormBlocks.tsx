import { useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { labelForChannelRow, normalizeChannelCode } from "@/utils/dahuaChannelUtils";
import type { DahuaDepartmentRow } from "@/api/twinApi";
import { OPEN_TYPE_OPTIONS } from "@/features/access-audit/AccessRecordFilterBar";
import type { useDahuaSwingStatsTasks } from "./useDahuaSwingStatsTasks";
import type { StatsUiForm } from "./statsTaskModel";

type Editor = ReturnType<typeof useDahuaSwingStatsTasks>;

export function StatsTaskNameEnabled({
  form,
  setForm,
  enabledHint,
  hideEnabled,
}: {
  form: StatsUiForm;
  setForm: Dispatch<SetStateAction<StatsUiForm>>;
  enabledHint: string;
  hideEnabled?: boolean;
}) {
  return (
    <>
      <label className="flex flex-col gap-1">
        任务名称
        <input className="h-9 rounded border px-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      {!hideEnabled ? (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.enabled === 1} onChange={(e) => setForm({ ...form, enabled: e.target.checked ? 1 : 0 })} />
          {enabledHint}
        </label>
      ) : null}
    </>
  );
}

export function StatsTaskDailyDataWindow({
  form,
  setForm,
}: {
  form: StatsUiForm;
  setForm: Dispatch<SetStateAction<StatsUiForm>>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 border-t pt-2">
      <label className="flex flex-col gap-1 text-[11px]">
        日内刷卡起始
        <input type="time" className="h-9 rounded border px-2" value={form.dataFromTime} onChange={(e) => setForm({ ...form, dataFromTime: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1 text-[11px]">
        日内刷卡截止
        <input type="time" className="h-9 rounded border px-2" value={form.dataToTime} onChange={(e) => setForm({ ...form, dataToTime: e.target.value })} />
      </label>
      <p className="col-span-2 text-[10px] text-slate-500 leading-relaxed">
        例如 00:00–23:59 表示拉取该自然日内全天刷卡；Job 每日几点跑请在「定时管理」配置。
      </p>
    </div>
  );
}

export function StatsTaskBackfillRange({
  form,
  setForm,
}: {
  form: StatsUiForm;
  setForm: Dispatch<SetStateAction<StatsUiForm>>;
}) {
  const historyStartDate = form.historyStart ? form.historyStart.slice(0, 10) : "";
  const historyEndDate = form.historyEnd ? form.historyEnd.slice(0, 10) : "";
  const historyStartClock = form.historyStart?.includes("T") ? form.historyStart.slice(11, 16) : "00:00";
  const historyEndClock = form.historyEnd?.includes("T") ? form.historyEnd.slice(11, 16) : "23:59";

  const mergeDateTime = (date: string, time: string, fallbackTime: string) => {
    if (!date) return "";
    const t = time || fallbackTime;
    return `${date}T${t.length === 5 ? t : fallbackTime}`;
  };

  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 space-y-2 border-t pt-2">
      <div className="text-[11px] font-semibold text-amber-900">回溯数据总范围（日期 + 起止时刻）</div>
      <p className="text-[10px] text-slate-600 leading-relaxed">
        从起始日时刻拉到结束日时刻，按「每段天数」分批请求大华；清洗入库亦按<strong>自然日</strong>分段写入日志。
        <strong>不参与定时</strong>。补漏或改规则后请点「<strong>强制全量拉取</strong>」按总范围重拉覆盖；「按游标下一段」仅在未标完成时续拉。
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px]">
          起始日（含）
          <input
            type="date"
            className="h-9 rounded border px-2 bg-white"
            value={historyStartDate}
            onChange={(e) =>
              setForm({
                ...form,
                historyStart: mergeDateTime(e.target.value, historyStartClock, "00:00"),
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]">
          起始时刻
          <input
            type="time"
            className="h-9 rounded border px-2 bg-white"
            value={historyStartClock}
            onChange={(e) =>
              setForm({
                ...form,
                historyStart: mergeDateTime(historyStartDate, e.target.value, "00:00"),
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]">
          结束日（含）
          <input
            type="date"
            className="h-9 rounded border px-2 bg-white"
            value={historyEndDate}
            onChange={(e) =>
              setForm({
                ...form,
                historyEnd: mergeDateTime(e.target.value, historyEndClock, "23:59"),
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]">
          结束时刻
          <input
            type="time"
            className="h-9 rounded border px-2 bg-white"
            value={historyEndClock}
            onChange={(e) =>
              setForm({
                ...form,
                historyEnd: mergeDateTime(historyEndDate, e.target.value, "23:59"),
              })
            }
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[11px]">
        每段天数（避免单次请求过大）
        <input
          type="number"
          min={1}
          max={31}
          className="h-9 rounded border px-2 bg-white w-24"
          value={form.backfillChunkDays}
          onChange={(e) => setForm({ ...form, backfillChunkDays: Math.max(1, Number(e.target.value) || 7) })}
        />
      </label>
      {form.backfillCursor ? <p className="text-[10px] text-slate-500">当前进度：下一段自 {form.backfillCursor}</p> : null}
    </div>
  );
}

export function StatsTaskDahuaFilters({ ed, deptRadioName }: { ed: Editor; deptRadioName: string }) {
  const departmentTreeGrouped = useMemo(() => {
    const childrenMap = new Map<number, DahuaDepartmentRow[]>();
    const byId = new Map<number, DahuaDepartmentRow>();
    for (const d of ed.deptOptions) {
      if (typeof d?.id === "number") byId.set(d.id, d);
    }
    for (const d of ed.deptOptions) {
      const pid = typeof d.parentId === "number" ? d.parentId : 0;
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid)!.push(d);
    }
    const roots = ed.deptOptions.filter((d) => {
      if (typeof d?.id !== "number") return false;
      if (typeof d.parentId !== "number") return true;
      return !byId.has(d.parentId);
    });
    return { roots, childrenMap };
  }, [ed.deptOptions]);

  return (
    <>
      <div className="border-t pt-2 text-[11px] text-slate-500">大华筛选</div>
      <label className="flex flex-col gap-1">
        通道（多选）
        <input
          className="h-8 rounded border px-2 mb-1"
          placeholder="搜索通道"
          value={ed.channelKeyword}
          onFocus={() => {
            if (!ed.channelLoaded) ed.setChannelLoaded();
          }}
          onChange={(e) => {
            ed.setChannelKeyword(e.target.value);
            if (!ed.channelLoaded) void ed.loadChannels(e.target.value);
          }}
        />
        <div className="max-h-28 overflow-auto rounded border p-1 space-y-0.5">
          {ed.channelOptions.map((ch) => {
            const code = normalizeChannelCode(ch.channelCode);
            if (!code) return null;
            const checked = ed.form.channelCodes.includes(code);
            return (
              <label key={code} className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (!checked) {
                      ed.setChannelLabelExtra((prev) => ({ ...prev, [code]: labelForChannelRow(ch) }));
                    }
                    ed.setForm((p) => ({
                      ...p,
                      channelCodes: checked ? p.channelCodes.filter((c) => c !== code) : [...p.channelCodes, code],
                    }));
                  }}
                />
                <span className="truncate">{(ch.channelName || "未命名通道") + " / " + code}</span>
              </label>
            );
          })}
        </div>
        {ed.form.channelCodes.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {ed.form.channelCodes.map((code) => {
              const k = normalizeChannelCode(code);
              const label =
                ed.channelLabelByCode.get(k) ||
                labelForChannelRow({ id: 0, channelCode: k, channelName: "" });
              return (
                <span key={k} title={k} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700 max-w-[220px] truncate">
                  {label}
                </span>
              );
            })}
          </div>
        )}
      </label>
      <div className="flex flex-col gap-1 text-[11px] text-slate-600">
        部门
        <div className="relative">
          <div className="flex h-8 items-center rounded border">
            <input
              className="flex-1 px-2 text-[11px] outline-none"
              placeholder="全部部门"
              value={ed.deptKeyword}
              onChange={(e) => {
                ed.setDeptKeyword(e.target.value);
                ed.setDeptDropdownOpen(true);
              }}
              onFocus={() => {
                ed.setDeptDropdownOpen(true);
                if (ed.deptOptions.length === 0) void ed.loadDepartments("");
              }}
            />
            <button type="button" className="h-full px-2" onClick={() => ed.setDeptDropdownOpen((v) => !v)}>
              ▾
            </button>
          </div>
          {ed.deptDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full rounded border bg-white p-2 shadow max-h-56 overflow-auto">
              <button
                type="button"
                className="mb-1 block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-50"
                onClick={() => {
                  ed.setForm((p) => ({ ...p, deptIds: "" }));
                  ed.setDeptKeyword("");
                  ed.setDeptDropdownOpen(false);
                }}
              >
                全部部门
              </button>
              {departmentTreeGrouped.roots.map((root) => {
                const renderNode = (node: DahuaDepartmentRow, depth: number): ReactNode => {
                  const nodeId = Number(node.id);
                  if (!Number.isFinite(nodeId)) return null;
                  const children = departmentTreeGrouped.childrenMap.get(nodeId) || [];
                  const open = ed.expandedDeptIds.has(nodeId);
                  const checked = String(nodeId) === ed.form.deptIds;
                  const deptName = (node.name || node.deptName || `部门${nodeId}`).trim();
                  return (
                    <div key={nodeId} className="mb-0.5" style={{ marginLeft: depth * 14 }}>
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name={deptRadioName}
                          checked={checked}
                          onChange={() => {
                            ed.setForm((p) => ({ ...p, deptIds: String(nodeId) }));
                            ed.setDeptKeyword(`${deptName} / ${nodeId}`);
                            ed.setDeptDropdownOpen(false);
                          }}
                        />
                        {deptName}
                      </label>
                      {open && children.map((c) => renderNode(c, depth + 1))}
                    </div>
                  );
                };
                return renderNode(root, 0);
              })}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          人员编码
          <input className="h-9 rounded border px-2" value={ed.form.personCode} onChange={(e) => ed.setForm({ ...ed.form, personCode: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          姓名
          <input className="h-9 rounded border px-2" value={ed.form.personName} onChange={(e) => ed.setForm({ ...ed.form, personName: e.target.value })} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        开门类型
        <select
          className="h-9 rounded border px-2"
          value={ed.form.openType === "" ? "" : String(ed.form.openType)}
          onChange={(e) => ed.setForm({ ...ed.form, openType: e.target.value === "" ? "" : Number(e.target.value) })}
        >
          <option value="">不限</option>
          {OPEN_TYPE_OPTIONS.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
