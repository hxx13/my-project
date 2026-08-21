import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useRefDataList } from "@/api/hooks/useReferenceData";
import { useSaveAnimalOrderTimePolicyAdmin } from "@/api/hooks/useAnimalOrderTime";
import type {
  AnimalOrderTimePolicyAdmin,
  AnimalOrderWindowRule,
} from "@/api/domains/animalOrderTime.api";
import { validateRuleGroups } from "./timeWindowConflict";

import { appConfirm } from "@/lib/appDialog";
interface TimeWindowRuleEditorProps {
  draft: AnimalOrderTimePolicyAdmin;
  onChange: (next: AnimalOrderTimePolicyAdmin) => void;
}

const ISO_WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 7, label: "周日" },
];

const DEFAULT_WEEKDAYS = "1,2,3,4,5";

const EMPTY_RULE: AnimalOrderWindowRule = {
  scope: "GLOBAL",
  categoryKey: null,
  effect: "OPEN",
  shape: "WEEKLY",
  weekdays: DEFAULT_WEEKDAYS,
  startWeekday: 1,
  endWeekday: 3,
  dailyStartTime: "09:00:00",
  dailyEndTime: "17:00:00",
  label: "",
  sortOrder: 0,
  active: 1,
};

function toTimeInput(value?: string | null): string {
  if (!value) return "09:00";
  return value.slice(0, 5);
}

function fromTimeInput(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

function parseWeekdays(csv?: string | null): number[] {
  if (!csv || !csv.trim()) return [];
  return csv
    .split(",")
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    .sort((a, b) => a - b);
}

function joinWeekdays(days: number[]): string {
  return [...new Set(days)]
    .filter((n) => n >= 1 && n <= 7)
    .sort((a, b) => a - b)
    .join(",");
}

function weekdayLabel(day?: number | null): string {
  if (day == null) return "?";
  return ISO_WEEKDAY_OPTIONS.find((o) => o.value === day)?.label ?? String(day);
}

function weekdayLabels(csv?: string | null): string {
  const days = parseWeekdays(csv);
  if (days.length === 0) return "每天";
  if (days.length === 7) return "每天";
  return days
    .map((d) => ISO_WEEKDAY_OPTIONS.find((o) => o.value === d)?.label ?? String(d))
    .join("、");
}

function ruleSummary(rule: AnimalOrderWindowRule): string {
  const effect = rule.effect === "OPEN" ? "开放" : "禁用";
  if (rule.shape === "RANGE") {
    return `${effect} · 旧区间（一次性） ${rule.rangeStartAt ?? "?"} ~ ${rule.rangeEndAt ?? "?"} · 请改为按星期循环`;
  }
  if (rule.shape === "WEEKLY_SPAN") {
    return `${effect} · ${weekdayLabel(rule.startWeekday)} ${toTimeInput(rule.dailyStartTime)} → ${weekdayLabel(rule.endWeekday)} ${toTimeInput(rule.dailyEndTime)}（跨星期连续）`;
  }
  return `${effect} · ${weekdayLabels(rule.weekdays)} ${toTimeInput(rule.dailyStartTime)} ~ ${toTimeInput(rule.dailyEndTime)}（每日固定）`;
}

function toEditableForm(rule: AnimalOrderWindowRule): AnimalOrderWindowRule {
  if (rule.shape === "WEEKLY_SPAN") {
    return {
      ...rule,
      shape: "WEEKLY_SPAN",
      weekdays: null,
      startWeekday: rule.startWeekday ?? 1,
      endWeekday: rule.endWeekday ?? 3,
      dailyStartTime: rule.dailyStartTime || "17:00:00",
      dailyEndTime: rule.dailyEndTime || "09:00:00",
      rangeStartAt: undefined,
      rangeEndAt: undefined,
    };
  }
  if (rule.shape === "WEEKLY" || rule.shape === "DAILY") {
    return {
      ...rule,
      shape: "WEEKLY",
      weekdays: parseWeekdays(rule.weekdays).length
        ? joinWeekdays(parseWeekdays(rule.weekdays))
        : "1,2,3,4,5,6,7",
      startWeekday: null,
      endWeekday: null,
      rangeStartAt: undefined,
      rangeEndAt: undefined,
    };
  }
  // Legacy RANGE → Form A defaults (user must confirm weekdays)
  return {
    ...rule,
    shape: "WEEKLY",
    weekdays: DEFAULT_WEEKDAYS,
    startWeekday: null,
    endWeekday: null,
    dailyStartTime: rule.dailyStartTime || "09:00:00",
    dailyEndTime: rule.dailyEndTime || "17:00:00",
    rangeStartAt: undefined,
    rangeEndAt: undefined,
  };
}

export default function TimeWindowRuleEditor({ draft, onChange }: TimeWindowRuleEditorProps) {
  const saveMut = useSaveAnimalOrderTimePolicyAdmin();
  const { data: breedItems = [] } = useRefDataList("ANIMAL_BREED");

  const [formVisible, setFormVisible] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [form, setForm] = useState<AnimalOrderWindowRule>(EMPTY_RULE);

  const breedOptions = useMemo(() => {
    return breedItems.map((item) => {
      const fd = item.fieldData as Record<string, unknown> | undefined;
      const name = (fd?.title || fd?.subtitle || `ID ${item.id}`) as string;
      return { value: String(item.id), label: name };
    });
  }, [breedItems]);

  const activeRules = useMemo(
    () => (draft.rules ?? []).filter((r) => r.active !== 0),
    [draft.rules],
  );

  const selectedWeekdays = useMemo(() => new Set(parseWeekdays(form.weekdays)), [form.weekdays]);
  const isSpanMode = form.shape === "WEEKLY_SPAN";

  function openCreate() {
    setEditIndex(null);
    setForm({ ...EMPTY_RULE, sortOrder: activeRules.length });
    setFormVisible(true);
  }

  function openEdit(index: number) {
    const rule = activeRules[index];
    setEditIndex(index);
    setForm(toEditableForm(rule));
    setFormVisible(true);
  }

  function resetForm() {
    setEditIndex(null);
    setForm({ ...EMPTY_RULE });
    setFormVisible(false);
  }

  function setCycleMode(mode: "WEEKLY" | "WEEKLY_SPAN") {
    setForm((f) => {
      if (mode === "WEEKLY_SPAN") {
        return {
          ...f,
          shape: "WEEKLY_SPAN",
          weekdays: null,
          startWeekday: f.startWeekday ?? 1,
          endWeekday: f.endWeekday ?? 3,
          dailyStartTime: f.dailyStartTime || "17:00:00",
          dailyEndTime: f.dailyEndTime || "09:00:00",
        };
      }
      return {
        ...f,
        shape: "WEEKLY",
        weekdays: parseWeekdays(f.weekdays).length
          ? joinWeekdays(parseWeekdays(f.weekdays))
          : DEFAULT_WEEKDAYS,
        startWeekday: null,
        endWeekday: null,
        dailyStartTime: f.dailyStartTime || "09:00:00",
        dailyEndTime: f.dailyEndTime || "17:00:00",
      };
    });
  }

  function toggleWeekday(day: number) {
    setForm((f) => {
      const set = new Set(parseWeekdays(f.weekdays));
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return { ...f, weekdays: joinWeekdays([...set]) };
    });
  }

  function validateFormRule(rule: AnimalOrderWindowRule): string | null {
    if (rule.scope === "CATEGORY" && !rule.categoryKey) {
      return "品类规则需选择品种";
    }
    if (rule.shape === "WEEKLY_SPAN") {
      if (
        rule.startWeekday == null ||
        rule.startWeekday < 1 ||
        rule.startWeekday > 7 ||
        rule.endWeekday == null ||
        rule.endWeekday < 1 ||
        rule.endWeekday > 7
      ) {
        return "请选择起止星期";
      }
      if (!rule.dailyStartTime || !rule.dailyEndTime) {
        return "请填写起止时间";
      }
      return null;
    }
    if (parseWeekdays(rule.weekdays).length === 0) {
      return "请至少选择一个星期";
    }
    if (!rule.dailyStartTime || !rule.dailyEndTime) {
      return "请填写起止时间";
    }
    return null;
  }

  function upsertRule() {
    const err = validateFormRule(form);
    if (err) {
      toast.error(err);
      return;
    }

    const rules = [...(draft.rules ?? [])];
    const nextRule: AnimalOrderWindowRule =
      form.shape === "WEEKLY_SPAN"
        ? {
            ...form,
            shape: "WEEKLY_SPAN",
            weekdays: null,
            startWeekday: form.startWeekday!,
            endWeekday: form.endWeekday!,
            categoryKey: form.scope === "CATEGORY" ? form.categoryKey : null,
            rangeStartAt: undefined,
            rangeEndAt: undefined,
            active: 1,
          }
        : {
            ...form,
            shape: "WEEKLY",
            weekdays: joinWeekdays(parseWeekdays(form.weekdays)),
            startWeekday: null,
            endWeekday: null,
            categoryKey: form.scope === "CATEGORY" ? form.categoryKey : null,
            rangeStartAt: undefined,
            rangeEndAt: undefined,
            active: 1,
          };

    if (editIndex != null) {
      const target = activeRules[editIndex];
      const idx = rules.findIndex((r) => r === target);
      if (idx >= 0) rules[idx] = { ...target, ...nextRule };
    } else {
      rules.push(nextRule);
    }

    try {
      validateRuleGroups(rules.filter((r) => r.active !== 0));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "规则冲突");
      return;
    }

    onChange({ ...draft, rules });
    resetForm();
  }

  async function removeRule(index: number) {
    if (!await appConfirm("确认删除此时段？")) return;
    const target = activeRules[index];
    const rules = (draft.rules ?? []).map((r) =>
      r === target ? { ...r, active: 0 } : r,
    );
    onChange({ ...draft, rules });
  }

  function handleSave() {
    if (activeRules.some((r) => r.shape === "RANGE")) {
      toast.error("存在旧的一次性区间规则，请先编辑并改为按星期循环后再保存");
      return;
    }
    const normalizedRules = (draft.rules ?? []).map((r) =>
      r.active === 0 ? r : toEditableForm(r),
    );
    try {
      validateRuleGroups(normalizedRules.filter((r) => r.active !== 0));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "规则冲突");
      return;
    }
    saveMut.mutate(
      { ...draft, rules: normalizedRules },
      {
        onError: (e: Error) => toast.error(e.message || "保存失败"),
      },
    );
  }

  function scopeLabel(rule: AnimalOrderWindowRule): string {
    if (rule.scope === "GLOBAL") return "全局";
    const opt = breedOptions.find((o) => o.value === rule.categoryKey);
    return opt ? `品种 · ${opt.label}` : `品种 ID ${rule.categoryKey ?? "?"}`;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
        <div className="mb-2 text-xs font-semibold text-[var(--twin-ink)]">无规则命中时的默认行为</div>
        <div className="flex flex-wrap gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="defaultMode"
              checked={draft.defaultMode === "OPEN"}
              onChange={() => onChange({ ...draft, defaultMode: "OPEN" })}
            />
            <span>默认可购 (OPEN)</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="defaultMode"
              checked={draft.defaultMode === "CLOSED"}
              onChange={() => onChange({ ...draft, defaultMode: "CLOSED" })}
            />
            <span>默认不可购 (CLOSED)</span>
          </label>
        </div>
      </div>

      <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
        {!formVisible ? (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full border border-dashed border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)] hover:border-[var(--twin-link)] hover:text-[var(--twin-link)]"
          >
            + 新建时段
          </button>
        ) : (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-[var(--twin-ink)]">
              {editIndex != null ? "编辑时段" : "新建时段"}
            </div>

            <div>
              <div className="mb-1.5 text-[10px] text-[var(--twin-mute)]">循环形式（二选一）</div>
              <div className="flex flex-col gap-2 text-xs sm:flex-row sm:gap-4">
                <label className="flex items-start gap-1.5">
                  <input
                    type="radio"
                    name="cycleMode"
                    className="mt-0.5"
                    checked={!isSpanMode}
                    onChange={() => setCycleMode("WEEKLY")}
                  />
                  <span>
                    <span className="font-medium text-[var(--twin-ink)]">每日固定时段</span>
                    <span className="mt-0.5 block text-[10px] text-[var(--twin-mute)]">
                      多选星期 + 同一起止时刻（如周一/三/五 09:00–18:00）
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-1.5">
                  <input
                    type="radio"
                    name="cycleMode"
                    className="mt-0.5"
                    checked={isSpanMode}
                    onChange={() => setCycleMode("WEEKLY_SPAN")}
                  />
                  <span>
                    <span className="font-medium text-[var(--twin-ink)]">跨星期连续区间</span>
                    <span className="mt-0.5 block text-[10px] text-[var(--twin-mute)]">
                      从某星期某时刻到另一星期某时刻（如周一 17:00 → 周三 09:00）
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-[var(--twin-mute)]">作用范围</span>
                <select
                  value={form.scope}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      scope: e.target.value as "GLOBAL" | "CATEGORY",
                      categoryKey: e.target.value === "GLOBAL" ? null : f.categoryKey,
                    }))
                  }
                  className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="GLOBAL">全局</option>
                  <option value="CATEGORY">指定品种</option>
                </select>
              </label>

              {form.scope === "CATEGORY" && (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--twin-mute)]">品种</span>
                  <select
                    value={form.categoryKey ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, categoryKey: e.target.value || null }))}
                    className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">请选择品种</option>
                    {breedOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-[var(--twin-mute)]">效果</span>
                <select
                  value={form.effect}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, effect: e.target.value as "OPEN" | "DISABLE" }))
                  }
                  className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="OPEN">开放 (OPEN)</option>
                  <option value="DISABLE">禁用 (DISABLE)</option>
                </select>
              </label>
            </div>

            {!isSpanMode ? (
              <>
                <div>
                  <div className="mb-1.5 text-[10px] text-[var(--twin-mute)]">循环星期（可多选）</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ISO_WEEKDAY_OPTIONS.map((opt) => {
                      const on = selectedWeekdays.has(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => toggleWeekday(opt.value)}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                            on
                              ? "bg-sky-600 text-white"
                              : "border border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      className="text-[10px] text-[var(--twin-link)] hover:underline"
                      onClick={() => setForm((f) => ({ ...f, weekdays: "1,2,3,4,5" }))}
                    >
                      工作日
                    </button>
                    <button
                      type="button"
                      className="text-[10px] text-[var(--twin-link)] hover:underline"
                      onClick={() => setForm((f) => ({ ...f, weekdays: "1,2,3,4,5,6,7" }))}
                    >
                      全周
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-[var(--twin-mute)]">每日开始时间</span>
                    <input
                      type="time"
                      value={toTimeInput(form.dailyStartTime)}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, dailyStartTime: fromTimeInput(e.target.value) }))
                      }
                      className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-[var(--twin-mute)]">每日结束时间</span>
                    <input
                      type="time"
                      value={toTimeInput(form.dailyEndTime)}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, dailyEndTime: fromTimeInput(e.target.value) }))
                      }
                      className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </label>
                </div>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--twin-mute)]">起点星期</span>
                  <select
                    value={form.startWeekday ?? 1}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, startWeekday: Number(e.target.value) }))
                    }
                    className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {ISO_WEEKDAY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--twin-mute)]">起点时刻</span>
                  <input
                    type="time"
                    value={toTimeInput(form.dailyStartTime)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dailyStartTime: fromTimeInput(e.target.value) }))
                    }
                    className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--twin-mute)]">终点星期</span>
                  <select
                    value={form.endWeekday ?? 3}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, endWeekday: Number(e.target.value) }))
                    }
                    className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {ISO_WEEKDAY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--twin-mute)]">终点时刻</span>
                  <input
                    type="time"
                    value={toTimeInput(form.dailyEndTime)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dailyEndTime: fromTimeInput(e.target.value) }))
                    }
                    className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </label>
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--twin-mute)]">备注标签（可选）</span>
              <input
                type="text"
                value={form.label ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder={isSpanMode ? "如：周末停购跨度" : "如：工作日开放"}
                className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={upsertRule}
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
              >
                {editIndex != null ? "更新时段" : "添加时段"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-[var(--twin-body)]">
          已有时段 ({activeRules.length})
        </div>
        {activeRules.length === 0 ? (
          <div className="py-4 text-center text-xs text-[var(--twin-mute)]">暂无时段</div>
        ) : (
          <div className="space-y-1.5">
            {activeRules.map((rule, index) => (
              <div
                key={rule.id ?? `new-${index}`}
                className="flex items-center justify-between rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--twin-ink)]">
                    {scopeLabel(rule)}
                    {rule.label ? ` · ${rule.label}` : ""}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--twin-mute)]">{ruleSummary(rule)}</div>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(index)}
                    className="rounded border border-[var(--twin-hairline)] px-2 py-0.5 text-[10px] text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRule(index)}
                    className="rounded border border-[var(--twin-hairline)] px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-50"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end border-t border-[var(--twin-hairline)] pt-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveMut.isPending}
          className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {saveMut.isPending ? "保存中…" : "保存可购窗口策略"}
        </button>
      </div>
    </div>
  );
}
