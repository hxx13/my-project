import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Pencil, Trash2, Plus } from "lucide-react";
import {
  listViolationRules,
  createViolationRule,
  updateViolationRule,
  deleteViolationRule,
  UNBLOCK_METHOD_LABEL,
  type ViolationRule,
} from "@/api/domains/studentViolation.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminTableShell } from "@/components/admin/AdminPageShell";

const emptyRule = (): ViolationRule => ({
  ruleCode: "",
  ruleName: "",
  enabled: 1,
  forbidEnter: 0,
  showNoticeEveryScan: 1,
  interactiveUnlockOnVerify: 1,
  unblockMethod: "自助解禁",
  unblockMaxCount: null,
  unblockWindowType: "滑动窗口",
  unblockWindowValue: 30,
  autoSignoutEnabled: 0,
});

export function ViolationRuleManager() {
  const queryClient = useQueryClient();
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["violation-rules"],
    queryFn: () => listViolationRules(),
  });

  const [editing, setEditing] = useState<ViolationRule | null>(null);
  const [showForm, setShowForm] = useState(false);

  const deleteMu = useMutation({
    mutationFn: deleteViolationRule,
    onSuccess: () => {
      toast.success("已删除");
      queryClient.invalidateQueries({ queryKey: ["violation-rules"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e.message || "删除失败"),
  });

  const handleOpenNew = () => {
    setEditing(emptyRule());
    setShowForm(true);
  };

  const handleOpenEdit = (rule: ViolationRule) => {
    setEditing({ ...rule });
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--app-color-text-primary)]">
          触发规则管理
        </h3>
        <AdminButton onClick={handleOpenNew}>
          <Plus className="w-4 h-4 mr-1" />
          新建规则
        </AdminButton>
      </div>

      <AdminTableShell
        loading={isLoading}
        empty={!isLoading && rules.length === 0}
        emptyMessage="暂无触发规则"
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-tertiary)]">
              <th className="py-2 px-3">编码</th>
              <th className="py-2 px-3">名称</th>
              <th className="py-2 px-3">解禁方式</th>
              <th className="py-2 px-3">上限次数</th>
              <th className="py-2 px-3">窗口</th>
              <th className="py-2 px-3">启用</th>
              <th className="py-2 px-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]"
              >
                <td className="py-2 px-3 font-mono text-xs">{r.ruleCode}</td>
                <td className="py-2 px-3">{r.ruleName}</td>
                <td className="py-2 px-3">
                  {UNBLOCK_METHOD_LABEL[r.unblockMethod] || r.unblockMethod}
                </td>
                <td className="py-2 px-3">
                  {r.unblockMaxCount != null ? r.unblockMaxCount : "不限"}
                </td>
                <td className="py-2 px-3 text-xs">
                  {r.unblockWindowType}
                  {r.unblockWindowValue ? ` ${r.unblockWindowValue}` : ""}
                  {r.unblockWindowType === "滑动窗口" ? "天" : ""}
                </td>
                <td className="py-2 px-3">
                  {r.enabled ? "✅" : "⏸"}
                </td>
                <td className="py-2 px-3 text-right space-x-1">
                  <AdminButton
                    onClick={() => handleOpenEdit(r)}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-0.5" />
                    编辑
                  </AdminButton>
                  <AdminButton
                    onClick={() => {
                      if (confirm(`确定删除规则「${r.ruleName}」？`)) {
                        deleteMu.mutate(r.id!);
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-0.5" />
                    删除
                  </AdminButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>

      {showForm && editing && (
        <RuleFormModal
          rule={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["violation-rules"] });
          }}
        />
      )}
    </div>
  );
}

/** 规则编辑弹窗 */
function RuleFormModal({
  rule,
  onClose,
  onSaved,
}: {
  rule: ViolationRule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !rule.id;
  const [form, setForm] = useState<ViolationRule>({ ...rule });

  const saveMu = useMutation({
    mutationFn: (body: ViolationRule) =>
      isNew ? createViolationRule(body) : updateViolationRule(rule.id!, body),
    onSuccess: () => {
      toast.success(isNew ? "规则已创建" : "规则已更新");
      onSaved();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e.message || "保存失败"),
  });

  const inputClass =
    "w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-[520px] max-h-[85vh] overflow-y-auto rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-[var(--app-elevation-modal)] p-6">
        <h3 className="text-lg font-bold text-[var(--app-color-text-primary)] mb-4">
          {isNew ? "新建触发规则" : "编辑触发规则"}
        </h3>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-[var(--app-color-text-secondary)]">编码</span>
              <input
                className={inputClass}
                value={form.ruleCode}
                onChange={(e) => setForm({ ...form, ruleCode: e.target.value })}
                disabled={!isNew}
                placeholder="AUTO_STRANDED"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-[var(--app-color-text-secondary)]">名称</span>
              <input
                className={inputClass}
                value={form.ruleName}
                onChange={(e) => setForm({ ...form, ruleName: e.target.value })}
                placeholder="滞留未签退"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-[var(--app-color-text-secondary)]">解禁方式</span>
              <select
                className={inputClass}
                value={form.unblockMethod}
                onChange={(e) =>
                  setForm({ ...form, unblockMethod: e.target.value as ViolationRule["unblockMethod"] })
                }
              >
                <option value="自助解禁">自助解禁</option>
                <option value="仅工作人员">仅工作人员</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-[var(--app-color-text-secondary)]">上限次数（空=不限）</span>
              <input
                className={inputClass}
                type="number"
                value={form.unblockMaxCount ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    unblockMaxCount: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-[var(--app-color-text-secondary)]">窗口类型</span>
              <select
                className={inputClass}
                value={form.unblockWindowType}
                onChange={(e) =>
                  setForm({ ...form, unblockWindowType: e.target.value as ViolationRule["unblockWindowType"] })
                }
              >
                <option value="滑动窗口">滑动窗口</option>
                <option value="固定周期">固定周期</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-[var(--app-color-text-secondary)]">
                {form.unblockWindowType === "滑动窗口" ? "天数" : "周期(1=月 2=周 3=学期)"}
              </span>
              <input
                className={inputClass}
                type="number"
                value={form.unblockWindowValue ?? 30}
                onChange={(e) =>
                  setForm({ ...form, unblockWindowValue: Number(e.target.value) })
                }
              />
            </label>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-[var(--app-color-text-primary)]">
              <input
                type="checkbox"
                checked={form.forbidEnter === 1}
                onChange={(e) => setForm({ ...form, forbidEnter: e.target.checked ? 1 : 0 })}
              />
              禁止进入
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--app-color-text-primary)]">
              <input
                type="checkbox"
                checked={form.enabled === 1}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked ? 1 : 0 })}
              />
              启用
            </label>
            {form.unblockMethod === "自助解禁" && (
              <label className="flex items-center gap-2 text-sm text-[var(--app-color-text-primary)]">
                <input
                  type="checkbox"
                  checked={form.autoSignoutEnabled === 1}
                  onChange={(e) =>
                    setForm({ ...form, autoSignoutEnabled: e.target.checked ? 1 : 0 })
                  }
                />
                自动签退
              </label>
            )}
          </div>

          {form.unblockMethod === "自助解禁" && (
            <label className="block">
              <span className="text-xs font-semibold text-[var(--app-color-text-secondary)]">
                交互拼图短语（留空=无需拼图）
              </span>
              <input
                className={inputClass}
                value={form.interactiveChallenge || ""}
                onChange={(e) =>
                  setForm({ ...form, interactiveChallenge: e.target.value || undefined })
                }
                placeholder='例如："一人一卡，严禁尾随"'
              />
            </label>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[var(--app-color-border-default)]">
          <button
            onClick={onClose}
            className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-4 py-2 text-sm font-semibold text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-active)]"
          >
            取消
          </button>
          <button
            onClick={() => saveMu.mutate(form)}
            disabled={saveMu.isPending || !form.ruleCode.trim() || !form.ruleName.trim()}
            className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saveMu.isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
