import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  fetchAutomationDisplayMaps,
  createAutomationDisplayMap,
  updateAutomationDisplayMap,
  deleteAutomationDisplayMap,
  type AutomationDisplayMapRow,
} from "@/api/twinApi";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";

const CODE_TYPES = [
  { value: "AUTOMATION_TYPE", label: "自动化类型 (如 AUTO_SIGNOUT)" },
  { value: "EVENT_KEY", label: "事件键 (如 RUN_REAPER)" },
  { value: "TRIGGER_TYPE", label: "触发方式 (TIMER/MANUAL/SYSTEM)" },
  { value: "TRIGGER_REASON", label: "触发原因码" },
];

export default function AdminAutomationLogMappingsPage() {
  const [rows, setRows] = useState<AutomationDisplayMapRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<AutomationDisplayMapRow | null>(null);
  const [form, setForm] = useState({ codeType: "EVENT_KEY", codeValue: "", labelZh: "", remark: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchAutomationDisplayMaps();
      setRows(Array.isArray(list) ? list : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setForm({ codeType: "EVENT_KEY", codeValue: "", labelZh: "", remark: "" });
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-slate-900">自动化日志展示映射</h1>
        <p className="mt-1 text-sm text-slate-600">
          此处仅覆盖<strong>四类枚举</strong>在列表中的中文标签（与库存英文码一一对应）。类型名须与后端一致：
          <code className="rounded bg-slate-100 px-1 text-xs">AUTOMATION_TYPE</code>、
          <code className="rounded bg-slate-100 px-1 text-xs">EVENT_KEY</code>、
          <code className="rounded bg-slate-100 px-1 text-xs">TRIGGER_TYPE</code>、
          <code className="rounded bg-slate-100 px-1 text-xs">TRIGGER_REASON</code>。
        </p>
        <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 p-3 text-xs text-slate-800 space-y-2">
          <p className="font-semibold text-sky-900">不必在此配置的展示（后端已处理）</p>
          <p>
            日志正文 <code className="rounded bg-white px-1">detail</code> 里常见的{" "}
            <code className="rounded bg-white px-1">state=…</code>、<code className="rounded bg-white px-1">channel=…</code>、
            <code className="rounded bg-white px-1">roomId=…</code>、<code className="rounded bg-white px-1">scheduledExitAt=…</code>：
            列表与首页流水弹窗会使用<strong>可读中文展开</strong>（并保留原文便于对账）。其中通道显示名来自大华设备通道缓存表；房间显示名来自本地{" "}
            <code className="rounded bg-white px-1">aro_access_log</code> 中同 roomId 的最近一条房间名。
          </p>
          <p className="text-slate-600">
            <strong>TRIGGER_REASON</strong> 常用码示例（若需改名可在此类型下覆盖）：{" "}
            <code className="rounded bg-white px-1">AUTO_SIGNOUT</code>、
            <code className="rounded bg-white px-1">ACTIVATION_EXPIRE_AUTO_SIGNOUT</code>、
            <code className="rounded bg-white px-1">FIRST_FREEZE_TIMER</code>、
            <code className="rounded bg-white px-1">SCHEDULE_TICK</code>、
            <code className="rounded bg-white px-1">MANUAL_RUN</code> 等；<strong>EVENT_KEY</strong> 如{" "}
            <code className="rounded bg-white px-1">AUTO_SIGNOUT_EXEC</code>、
            <code className="rounded bg-white px-1">RUN_REAPER</code> 等。
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 text-sm font-medium text-slate-800">{editing ? "编辑映射" : "新增映射"}</div>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          <select
            value={form.codeType}
            onChange={(e) => setForm((f) => ({ ...f, codeType: e.target.value }))}
            className="rounded-md border px-2 py-2 text-sm"
          >
            {CODE_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            value={form.codeValue}
            onChange={(e) => setForm((f) => ({ ...f, codeValue: e.target.value }))}
            placeholder="原始码值（英文）"
            className="rounded-md border px-2 py-2 text-sm"
          />
          <input
            value={form.labelZh}
            onChange={(e) => setForm((f) => ({ ...f, labelZh: e.target.value }))}
            placeholder="展示中文"
            className="rounded-md border px-2 py-2 text-sm"
          />
          <input
            value={form.remark}
            onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
            placeholder="备注（可选）"
            className="rounded-md border px-2 py-2 text-sm"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
            onClick={async () => {
              if (!form.codeValue.trim() || !form.labelZh.trim()) {
                toast.error("请填写码值与中文标签");
                return;
              }
              try {
                if (editing?.id != null) {
                  await updateAutomationDisplayMap(editing.id, {
                    id: editing.id,
                    codeType: form.codeType,
                    codeValue: form.codeValue.trim(),
                    labelZh: form.labelZh.trim(),
                    remark: form.remark.trim(),
                  });
                  toast.success("已更新");
                } else {
                  await createAutomationDisplayMap({
                    codeType: form.codeType,
                    codeValue: form.codeValue.trim(),
                    labelZh: form.labelZh.trim(),
                    remark: form.remark.trim(),
                  });
                  toast.success("已添加");
                }
                resetForm();
                await load();
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : "保存失败");
              }
            }}
          >
            {editing ? "保存修改" : "添加"}
          </button>
          {editing && (
            <button type="button" className="rounded-md border px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={resetForm}>
              取消编辑
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-800">已有映射</span>
          {loading && <span className="text-xs text-slate-500">加载中…</span>}
        </div>
        <AdminDataTableWrap scrollable className="rounded-none border-0 bg-transparent shadow-none ring-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-600">
                <th className="px-2 py-2">类型</th>
                <th className="px-2 py-2">码值</th>
                <th className="px-2 py-2">中文</th>
                <th className="px-2 py-2">备注</th>
                <th className="px-2 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b align-top hover:bg-slate-50">
                  <td className="px-2 py-2 font-mono text-xs">{r.codeType}</td>
                  <td className="px-2 py-2 font-mono text-xs">{r.codeValue}</td>
                  <td className="px-2 py-2">{r.labelZh}</td>
                  <td className="max-w-[12rem] px-2 py-2 text-xs text-slate-600">{r.remark || "-"}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      className="mr-2 text-blue-600 hover:underline"
                      onClick={() => {
                        setEditing(r);
                        setForm({
                          codeType: r.codeType,
                          codeValue: r.codeValue,
                          labelZh: r.labelZh,
                          remark: r.remark || "",
                        });
                      }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="text-rose-600 hover:underline"
                      onClick={async () => {
                        if (!r.id || !window.confirm("确定删除该条映射？")) return;
                        try {
                          await deleteAutomationDisplayMap(r.id);
                          toast.success("已删除");
                          if (editing?.id === r.id) resetForm();
                          await load();
                        } catch (e: unknown) {
                          toast.error(e instanceof Error ? e.message : "删除失败");
                        }
                      }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr>
                  <td colSpan={5} className="px-2 py-8 text-center text-slate-500">
                    暂无自定义映射
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </AdminDataTableWrap>
      </div>
    </div>
  );
}
