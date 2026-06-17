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

const RULE_CATEGORIES = [
  { value: "滞留未签退", sourceTag: "AUTO_STRANDED", label: "滞留未签退（自动检测）" },
  { value: "手动违规", sourceTag: "MANUAL", label: "手动违规" },
  { value: "自定义", sourceTag: "", label: "自定义规则" },
] as const;

const emptyRule = (): ViolationRule => ({
  ruleCode: "",
  ruleName: "",
  enabled: 1,
  sourceTag: "MANUAL",
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

  // Detect category from sourceTag for editing
  const detectCategory = (sourceTag?: string) => {
    const found = RULE_CATEGORIES.find((c) => c.sourceTag === sourceTag);
    return found?.value ?? "自定义";
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
        isLoading={isLoading}
        isEmpty={!isLoading && rules.length === 0}
        emptyMessage="暂无触发规则"
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-tertiary)]">
              <th className="py-2 px-3">规则名称</th>
              <th className="py-2 px-3" title="自动生成">编码</th>
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
                <td className="py-2 px-3 font-semibold">{r.ruleName}</td>
                <td className="py-2 px-3 font-mono text-[10px] text-[var(--app-color-text-tertiary)]" title="自动生成">
                  {r.ruleCode}
                </td>
                <td className="py-2 px-3">
                  {UNBLOCK_METHOD_LABEL[r.unblockMethod] || r.unblockMethod}
                </td>
                <td className="py-2 px-3">
                  {r.unblockMaxCount != null ? r.unblockMaxCount : "不限"}
                </td>
                <td className="py-2 px-3 text-xs">
                  {r.unblockWindowType === "滑动窗口"
                    ? `最近 ${r.unblockWindowValue ?? 30} 天`
                    : r.unblockWindowStart && r.unblockWindowEnd
                      ? `${r.unblockWindowStart} ~ ${r.unblockWindowEnd}`
                      : "未配置"}
                </td>
                <td className="py-2 px-3">{r.enabled ? "✅" : "⏸"}</td>
                <td className="py-2 px-3 text-right space-x-1">
                  <AdminButton onClick={() => handleOpenEdit(r)}>
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
          initialCategory={detectCategory(editing.sourceTag)}
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

/** 规则编辑弹窗 — 分区表单 */
function RuleFormModal({
  rule,
  initialCategory,
  onClose,
  onSaved,
}: {
  rule: ViolationRule;
  initialCategory: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !rule.id;
  const [form, setForm] = useState<ViolationRule>({ ...rule });
  const [category, setCategory] = useState(initialCategory);
  const isStranded = category === "滞留未签退";
  const isCustom = category === "自定义";

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

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    const found = RULE_CATEGORIES.find((c) => c.value === cat);
    if (found) {
      setForm((prev) => ({
        ...prev,
        sourceTag: found.sourceTag,
        // 滞留类自动开启自动签退
        autoSignoutEnabled: cat === "滞留未签退" ? 1 : 0,
      }));
    }
  };

  const inputClass =
    "w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";

  const labelClass = "text-xs font-semibold text-[var(--app-color-text-secondary)]";

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-[560px] max-h-[88vh] overflow-y-auto rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-[var(--app-elevation-modal)] p-6">
        <h3 className="text-lg font-bold text-[var(--app-color-text-primary)] mb-5">
          {isNew ? "新建触发规则" : "编辑触发规则"}
        </h3>

        {/* ═══ 基本信息 ═══ */}
        <fieldset className="mb-5">
          <legend className="text-xs font-bold uppercase tracking-wider text-[var(--app-color-text-tertiary)] mb-3">
            基本信息
          </legend>
          <div className="space-y-3">
            <label className="block">
              <span className={labelClass}>规则类型</span>
              <select
                className={inputClass}
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                disabled={!isNew}
              >
                {RULE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={labelClass}>规则名称</span>
              <input
                className={inputClass}
                value={form.ruleName}
                onChange={(e) => setForm({ ...form, ruleName: e.target.value })}
                placeholder="例如：滞留未签退"
              />
              <p className="text-[10px] text-[var(--app-color-text-tertiary)] mt-0.5">
                编码将自动生成，无需手动填写
              </p>
            </label>

            {isCustom && (
              <label className="block">
                <span className={labelClass}>source_tag（技术标识）</span>
                <input
                  className={inputClass}
                  value={form.sourceTag || ""}
                  onChange={(e) => setForm({ ...form, sourceTag: e.target.value })}
                  placeholder="自定义标签"
                />
              </label>
            )}
          </div>
        </fieldset>

        {/* ═══ 解禁控制 ═══ */}
        <fieldset className="mb-5">
          <legend className="text-xs font-bold uppercase tracking-wider text-[var(--app-color-text-tertiary)] mb-3">
            解禁控制
          </legend>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClass}>解禁方式</span>
                <select
                  className={inputClass}
                  value={form.unblockMethod}
                  onChange={(e) =>
                    setForm({ ...form, unblockMethod: e.target.value as ViolationRule["unblockMethod"] })
                  }
                >
                  <option value="自助解禁">自助解禁（拼图验证）</option>
                  <option value="仅工作人员">仅工作人员</option>
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>上限次数（空=不限）</span>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={form.unblockMaxCount ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      unblockMaxCount: e.target.value ? Math.max(0, Number(e.target.value)) : null,
                    })
                  }
                  placeholder="不限制"
                />
              </label>
            </div>

            {/* 时间窗口 */}
            <div>
              <span className={labelClass}>时间窗口</span>
              <div className="mt-1.5 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="windowType"
                    checked={form.unblockWindowType === "滑动窗口"}
                    onChange={() =>
                      setForm({ ...form, unblockWindowType: "滑动窗口", unblockWindowStart: undefined, unblockWindowEnd: undefined })
                    }
                  />
                  滑动窗口：最近
                  <input
                    className="w-16 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-0.5 text-sm text-center"
                    type="number"
                    min={1}
                    value={form.unblockWindowValue ?? 30}
                    onChange={(e) =>
                      setForm({ ...form, unblockWindowValue: Number(e.target.value) || 30 })
                    }
                    disabled={form.unblockWindowType !== "滑动窗口"}
                  />
                  天
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="windowType"
                    checked={form.unblockWindowType === "固定周期"}
                    onChange={() =>
                      setForm({ ...form, unblockWindowType: "固定周期", unblockWindowValue: undefined })
                    }
                  />
                  固定周期：每年
                  <input
                    className="w-20 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-0.5 text-sm text-center font-mono"
                    placeholder="03-01"
                    maxLength={5}
                    value={form.unblockWindowStart || ""}
                    onChange={(e) =>
                      setForm({ ...form, unblockWindowStart: e.target.value })
                    }
                    disabled={form.unblockWindowType !== "固定周期"}
                  />
                  至
                  <input
                    className="w-20 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-0.5 text-sm text-center font-mono"
                    placeholder="07-01"
                    maxLength={5}
                    value={form.unblockWindowEnd || ""}
                    onChange={(e) =>
                      setForm({ ...form, unblockWindowEnd: e.target.value })
                    }
                    disabled={form.unblockWindowType !== "固定周期"}
                  />
                </label>
              </div>
              <p className="text-[10px] text-[var(--app-color-text-tertiary)] mt-1">
                {form.unblockWindowType === "滑动窗口"
                  ? `从现在往前推 ${form.unblockWindowValue ?? 30} 天内的违规记录参与计数`
                  : "每年此日期范围内的违规记录参与计数"}
              </p>
            </div>

            {form.unblockMethod === "自助解禁" && (
              <label className="block">
                <span className={labelClass}>交互拼图短语（留空=无需拼图验证）</span>
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
        </fieldset>

        {/* ═══ 违规行为 ═══ */}
        <fieldset className="mb-5">
          <legend className="text-xs font-bold uppercase tracking-wider text-[var(--app-color-text-tertiary)] mb-3">
            违规行为
          </legend>
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--app-color-accent)]"
                checked={form.forbidEnter === 1}
                onChange={(e) => setForm({ ...form, forbidEnter: e.target.checked ? 1 : 0 })}
              />
              <div>
                <span className="font-semibold text-[var(--app-color-text-primary)]">禁止进入</span>
                <p className="text-[11px] text-[var(--app-color-text-tertiary)] leading-snug mt-0.5">
                  勾选：每次触发违规都阻止进入，用户需逐个解除。
                  <br />
                  不勾选：仅弹窗警告，不阻止进入。
                  <br />
                  <strong className="text-[var(--app-color-feedback-warning)]">
                    无论是否勾选，达到上限次数后强制禁止进入。
                  </strong>
                </p>
              </div>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled === 1}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked ? 1 : 0 })}
                className="accent-[var(--app-color-accent)]"
              />
              <span className="text-[var(--app-color-text-primary)]">启用此规则</span>
            </label>

            {/* ═══ 按类型专用配置 ═══ */}
            {isStranded && (
              <div className="rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-3 space-y-3">
                <p className="text-[11px] font-bold text-[var(--app-color-text-secondary)]">
                  滞留检测专用配置
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.autoSignoutEnabled === 1}
                    onChange={(e) =>
                      setForm({ ...form, autoSignoutEnabled: e.target.checked ? 1 : 0 })
                    }
                    className="accent-[var(--app-color-accent)]"
                  />
                  <span className="text-[var(--app-color-text-primary)]">检测到滞留时自动签退</span>
                </label>
                <label className="block">
                  <span className={labelClass}>违规文案模板</span>
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={form.violationTextTpl || ""}
                    onChange={(e) => setForm({ ...form, violationTextTpl: e.target.value })}
                    placeholder={'${name}(${dept})滞留未签退，系统自动登记'}
                  />
                  <p className="text-[10px] text-[var(--app-color-text-tertiary)] mt-0.5">
                    可用变量：{"${name}"} {"${dept}"} {"${date}"}
                  </p>
                </label>
              </div>
            )}

            {category === "手动违规" && (
              <div className="rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-3">
                <p className="text-[11px] font-bold text-[var(--app-color-text-secondary)] mb-2">
                  手动违规配置
                </p>
                <label className="block">
                  <span className={labelClass}>过期天数（空=永不过期）</span>
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    value={form.expireAfterDays ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, expireAfterDays: e.target.value ? Number(e.target.value) : undefined })
                    }
                  />
                </label>
              </div>
            )}
          </div>
        </fieldset>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--app-color-border-default)]">
          <button
            onClick={onClose}
            className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-4 py-2 text-sm font-semibold text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-active)]"
          >
            取消
          </button>
          <button
            onClick={() => saveMu.mutate(form)}
            disabled={saveMu.isPending || !form.ruleName.trim()}
            className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saveMu.isPending ? "保存中..." : "保存规则"}
          </button>
        </div>
      </div>
    </div>
  );
}
