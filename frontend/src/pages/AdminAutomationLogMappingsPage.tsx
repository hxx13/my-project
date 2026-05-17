import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Tags } from "lucide-react";
import {
  fetchAutomationDisplayMaps,
  createAutomationDisplayMap,
  updateAutomationDisplayMap,
  deleteAutomationDisplayMap,
  type AutomationDisplayMapRow,
} from "@/api/twinApi";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { adminHintClass, adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";

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
  const [saving, setSaving] = useState(false);

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

  const onSaveMapping = async () => {
    if (!form.codeValue.trim() || !form.labelZh.trim()) {
      toast.error("请填写码值与中文标签");
      return;
    }
    setSaving(true);
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
        const id = editing.id;
        const payload: AutomationDisplayMapRow = {
          id,
          codeType: form.codeType,
          codeValue: form.codeValue.trim(),
          labelZh: form.labelZh.trim(),
          remark: form.remark.trim(),
        };
        resetForm();
        // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...payload } : r)));
      } else {
        const newId = await createAutomationDisplayMap({
          codeType: form.codeType,
          codeValue: form.codeValue.trim(),
          labelZh: form.labelZh.trim(),
          remark: form.remark.trim(),
        });
        toast.success("已添加");
        resetForm();
        // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
        setRows((prev) => [
          ...prev,
          {
            id: newId,
            codeType: form.codeType,
            codeValue: form.codeValue.trim(),
            labelZh: form.labelZh.trim(),
            remark: form.remark.trim(),
          },
        ]);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <Tags className="h-6 w-6 shrink-0 text-[#0070f3]" aria-hidden />
          日志名称映射
        </span>
      }
      description="维护自动化日志列表中枚举类字段的中文展示名（与后端英文码一一对应）。"
    >
      <div className="flex flex-col gap-4">
        <AdminFormCard
          title="配置说明"
          description={
            <span>
              此处仅覆盖<strong>四类枚举</strong>在列表中的中文标签（与库存英文码一一对应）。类型名须与后端一致：
              <code className="rounded bg-neutral-100 px-1 text-xs">AUTOMATION_TYPE</code>、
              <code className="rounded bg-neutral-100 px-1 text-xs">EVENT_KEY</code>、
              <code className="rounded bg-neutral-100 px-1 text-xs">TRIGGER_TYPE</code>、
              <code className="rounded bg-neutral-100 px-1 text-xs">TRIGGER_REASON</code>。
            </span>
          }
        >
          <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-3 text-xs text-slate-800 space-y-2">
            <p className="font-semibold text-sky-900">不必在此配置的展示（后端已处理）</p>
            <p>
              日志正文 <code className="rounded bg-white px-1">detail</code> 里常见的{" "}
              <code className="rounded bg-white px-1">state=…</code>、<code className="rounded bg-white px-1">channel=…</code>、
              <code className="rounded bg-white px-1">roomId=…</code>、<code className="rounded bg-white px-1">scheduledExitAt=…</code>
              ：列表与首页流水弹窗会使用<strong>可读中文展开</strong>（并保留原文便于对账）。其中通道显示名来自大华设备通道缓存表；房间显示名来自本地{" "}
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
        </AdminFormCard>

        <AdminFormCard title={editing ? "编辑映射" : "新增映射"} description="填写英文码值与列表展示用的中文标签。">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className={adminLabelClass}>类型</span>
              <AdminSelect value={form.codeType} onChange={(e) => setForm((f) => ({ ...f, codeType: e.target.value }))}>
                {CODE_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </label>
            <label className="flex flex-col gap-1">
              <span className={adminLabelClass}>原始码值（英文）</span>
              <input
                value={form.codeValue}
                onChange={(e) => setForm((f) => ({ ...f, codeValue: e.target.value }))}
                placeholder="如 RUN_REAPER"
                className={adminInputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={adminLabelClass}>展示中文</span>
              <input
                value={form.labelZh}
                onChange={(e) => setForm((f) => ({ ...f, labelZh: e.target.value }))}
                placeholder="列表中显示的中文"
                className={adminInputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={adminLabelClass}>备注（可选）</span>
              <input
                value={form.remark}
                onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder="备注"
                className={adminInputClass}
              />
            </label>
          </div>
          <p className={adminHintClass}>增删改成功后仅更新本地列表状态，避免无意义的全量重拉。</p>
          <div className="flex flex-wrap gap-2">
            <AdminButton type="button" tone="primary" disabled={saving} onClick={() => void onSaveMapping()}>
              {editing ? "保存修改" : "添加"}
            </AdminButton>
            {editing ? (
              <AdminButton type="button" tone="secondary" onClick={resetForm}>
                取消编辑
              </AdminButton>
            ) : null}
          </div>
        </AdminFormCard>

        <AdminFormCard title="已有映射" description="点击行内按钮可编辑或删除。">
          <AdminTableShell loading={loading} empty={!loading && rows.length === 0} emptyMessage="暂无自定义映射" scrollable>
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
                      <AdminButton
                        type="button"
                        tone="ghost"
                        size="sm"
                        className="mr-1"
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
                      </AdminButton>
                      <AdminButton
                        type="button"
                        tone="destructive"
                        size="sm"
                        onClick={() => void (async () => {
                          if (!r.id || !window.confirm("确定删除该条映射？")) return;
                          try {
                            await deleteAutomationDisplayMap(r.id);
                            toast.success("已删除");
                            if (editing?.id === r.id) resetForm();
                            // 删除后仅从列表移除该行，禁止整表 load（post-save-no-full-refresh.mdc）
                            setRows((prev) => prev.filter((x) => x.id !== r.id));
                          } catch (e: unknown) {
                            toast.error(e instanceof Error ? e.message : "删除失败");
                          }
                        })()}
                      >
                        删除
                      </AdminButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableShell>
        </AdminFormCard>
      </div>
    </AdminPageShell>
  );
}
