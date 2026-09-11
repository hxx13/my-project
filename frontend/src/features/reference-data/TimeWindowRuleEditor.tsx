import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRefDataList } from "@/api/hooks/useReferenceData";
import { useSaveAnimalOrderTimePolicyAdmin } from "@/api/hooks/useAnimalOrderTime";
import type {
  AnimalOrderTimePolicyAdmin,
  AnimalOrderWindowRule,
} from "@/api/domains/animalOrderTime.api";
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

/** 特殊时段：一次性绝对区间，全局、只能开放，新区间默认「今天 09:00 → 今天 18:00」 */
const EMPTY_SPECIAL_RULE: AnimalOrderWindowRule = {
  scope: "GLOBAL",
  categoryKey: null,
  effect: "OPEN",
  shape: "RANGE",
  weekdays: null,
  dailyStartTime: undefined,
  dailyEndTime: undefined,
  rangeStartAt: "",
  rangeEndAt: "",
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

/**
 * 后端 LocalDateTime 串 ↔ datetime-local 输入值。
 * 项目 Jackson 统一用 `yyyy-MM-dd HH:mm:ss`（JacksonTimeConfig.WALL_CLOCK，空格分隔且必须带秒），
 * 而 datetime-local 给的是 `yyyy-MM-ddTHH:mm`，两边都要转，否则反序列化直接 400。
 */
function toDateTimeInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 16).replace(" ", "T");
}

/** datetime-local 值 → 后端要求的 `yyyy-MM-dd HH:mm:ss` */
function toApiDateTime(value?: string | null): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  const withSpace = v.replace("T", " ");
  return withSpace.length === 16 ? `${withSpace}:00` : withSpace;
}

/** 一次性区间是否已过期（过期即自动失效，界面给个标记） */
function isRangeExpired(rule: AnimalOrderWindowRule): boolean {
  if (rule.shape !== "RANGE" || !rule.rangeEndAt) return false;
  const end = new Date(toDateTimeInput(rule.rangeEndAt));
  return Number.isFinite(end.getTime()) && end.getTime() < Date.now();
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
    const s = toDateTimeInput(rule.rangeStartAt).replace("T", " ");
    const e = toDateTimeInput(rule.rangeEndAt).replace("T", " ");
    return `特殊开放 ${s || "?"} ~ ${e || "?"}`;
  }
  if (rule.shape === "WEEKLY_SPAN") {
    return `${effect} · ${weekdayLabel(rule.startWeekday)} ${toTimeInput(rule.dailyStartTime)} → ${weekdayLabel(rule.endWeekday)} ${toTimeInput(rule.dailyEndTime)}（跨星期连续）`;
  }
  return `${effect} · ${weekdayLabels(rule.weekdays)} ${toTimeInput(rule.dailyStartTime)} ~ ${toTimeInput(rule.dailyEndTime)}（每日固定）`;
}

function toEditableForm(rule: AnimalOrderWindowRule): AnimalOrderWindowRule {
  if (rule.shape === "RANGE") {
    // 特殊时段：保留区间，表单里用 datetime-local 值
    return {
      ...rule,
      shape: "RANGE",
      scope: "GLOBAL",
      effect: "OPEN",
      categoryKey: null,
      rangeStartAt: toDateTimeInput(rule.rangeStartAt),
      rangeEndAt: toDateTimeInput(rule.rangeEndAt),
    };
  }
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

/** 行 id：优先用数据库 id，新建未保存的用下标兜底 */
function rowId(rule: AnimalOrderWindowRule, index: number): string {
  return rule.id != null ? `rule-${rule.id}` : `new-${index}`;
}

interface SortableRuleRowProps {
  id: string;
  rule: AnimalOrderWindowRule;
  scopeText: string;
  draggable: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

function SortableRuleRow({ id, rule, scopeText, draggable, onEdit, onToggleActive, onDelete }: SortableRuleRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !draggable,
  });
  const off = rule.active === 0;
  const isSpecial = rule.shape === "RANGE";
  const expired = !off && isRangeExpired(rule);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`flex items-center gap-2 rounded-twin-md border px-3 py-2 ${
        off
          ? "border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)]"
          : "border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]"
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={!draggable}
        title={draggable ? "拖拽调整优先级" : isSpecial ? "特殊时段恒为最高优先级" : "停用的时段不参与排序"}
        className={`shrink-0 rounded p-0.5 text-[var(--twin-mute)] ${
          draggable ? "cursor-grab hover:text-[var(--twin-link)]" : "cursor-not-allowed opacity-30"
        }`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className={`min-w-0 flex-1 ${off ? "opacity-50" : ""}`}>
        <div className="flex items-center gap-1.5">
          {isSpecial && (
            <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700">
              特殊
            </span>
          )}
          <span className="truncate text-sm font-medium text-[var(--twin-ink)]">
            {scopeText}
            {rule.label ? ` · ${rule.label}` : ""}
          </span>
        </div>
        <div className="mt-0.5 text-[10px] text-[var(--twin-mute)]">
          {ruleSummary(rule)}
          {expired && <span className="ml-1 text-amber-600">· 已失效</span>}
        </div>
      </div>
      <div className="ml-1 flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggleActive}
          className={`rounded border px-2 py-0.5 text-[10px] ${
            off
              ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              : "border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]"
          }`}
        >
          {off ? "启用" : "停用"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded border border-[var(--twin-hairline)] px-2 py-0.5 text-[10px] text-[var(--twin-body)] hover:bg-[var(--twin-canvas)]"
        >
          编辑
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded border border-[var(--twin-hairline)] px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-50"
        >
          删除
        </button>
      </div>
    </div>
  );
}

export default function TimeWindowRuleEditor({ draft, onChange }: TimeWindowRuleEditorProps) {
  const saveMut = useSaveAnimalOrderTimePolicyAdmin();
  const { data: breedItems = [] } = useRefDataList("ANIMAL_BREED");

  const [formVisible, setFormVisible] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [form, setForm] = useState<AnimalOrderWindowRule>(EMPTY_RULE);
  const [specialVisible, setSpecialVisible] = useState(false);
  const [specialEditIndex, setSpecialEditIndex] = useState<number | null>(null);
  const [specialForm, setSpecialForm] = useState<AnimalOrderWindowRule>(EMPTY_SPECIAL_RULE);

  const breedOptions = useMemo(() => {
    return breedItems.map((item) => {
      const fd = item.fieldData as Record<string, unknown> | undefined;
      const name = (fd?.title || fd?.subtitle || `ID ${item.id}`) as string;
      return { value: String(item.id), label: name };
    });
  }, [breedItems]);

  /**
   * 展示与优先级顺序：特殊时段（RANGE）固定置顶且不可拖，其余按 sortOrder。
   * 引擎按同一顺序「首个命中者胜出」，所以这里的顺序就是生效优先级。
   */
  const orderedRules = useMemo(() => {
    const all = draft.rules ?? [];
    const specials = all.filter((r) => r.shape === "RANGE");
    const rest = all
      .filter((r) => r.shape !== "RANGE")
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.id ?? 0) - (b.id ?? 0));
    return [...specials, ...rest];
  }, [draft.rules]);

  const activeRules = useMemo(() => orderedRules.filter((r) => r.active !== 0), [orderedRules]);

  const selectedWeekdays = useMemo(() => new Set(parseWeekdays(form.weekdays)), [form.weekdays]);
  const isSpanMode = form.shape === "WEEKLY_SPAN";

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = orderedRules.findIndex((r, i) => rowId(r, i) === String(active.id));
    const to = orderedRules.findIndex((r, i) => rowId(r, i) === String(over.id));
    if (from < 0 || to < 0) return;
    moveRule(from, to);
  }

  function openCreate() {
    setEditIndex(null);
    setForm({ ...EMPTY_RULE, sortOrder: orderedRules.length });
    setFormVisible(true);
  }

  function openEdit(index: number) {
    const rule = orderedRules[index];
    if (!rule) return;
    if (rule.shape === "RANGE") {
      setSpecialEditIndex(index);
      setSpecialForm(toEditableForm(rule));
      setSpecialVisible(true);
      return;
    }
    setEditIndex(index);
    setForm(toEditableForm(rule));
    setFormVisible(true);
  }

  function openCreateSpecial() {
    setSpecialEditIndex(null);
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const end = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    const fmt = (d: Date) => {
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    setSpecialForm({ ...EMPTY_SPECIAL_RULE, rangeStartAt: fmt(start), rangeEndAt: fmt(end) });
    setSpecialVisible(true);
  }

  function resetSpecialForm() {
    setSpecialEditIndex(null);
    setSpecialForm({ ...EMPTY_SPECIAL_RULE });
    setSpecialVisible(false);
  }

  /** 启用/停用：写 active 标志位，行保留（后端 softDelete 就是 SET active=0） */
  function toggleRuleActive(index: number) {
    const target = orderedRules[index];
    if (!target) return;
    const rules = (draft.rules ?? []).map((r) =>
      r === target ? { ...r, active: r.active === 0 ? 1 : 0 } : r,
    );
    onChange({ ...draft, rules });
  }

  /** 删除：软删除——先移出草稿、记下 id，随保存一起落库（deleted=1，行保留可恢复） */
  async function deleteRule(index: number) {
    const target = orderedRules[index];
    if (!target) return;
    if (!await appConfirm("确认删除此时段？\n\n删除后不再参与可购判定，数据库中保留、可恢复。")) return;
    const rules = (draft.rules ?? []).filter((r) => r !== target);
    const deletedRuleIds = target.id != null
      ? [...(draft.deletedRuleIds ?? []), target.id]
      : (draft.deletedRuleIds ?? []);
    onChange({ ...draft, rules, deletedRuleIds });
  }

  /** 拖拽换序：只重排非特殊规则，随后整表按展示顺序重编号 sortOrder（特殊时段恒为最前） */
  function moveRule(fromIndex: number, toIndex: number) {
    const ids = orderedRules.map((r) => r);
    const specialCount = ids.filter((r) => r.shape === "RANGE").length;
    if (fromIndex < specialCount || toIndex < specialCount) return;
    const movable = ids.slice(specialCount);
    const reordered = arrayMove(movable, fromIndex - specialCount, toIndex - specialCount);
    const next = [...ids.slice(0, specialCount), ...reordered].map((r, i) => ({ ...r, sortOrder: i }));
    onChange({ ...draft, rules: next });
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
    if (rule.shape === "RANGE") {
      if (!rule.rangeStartAt || !rule.rangeEndAt) return "请填写特殊时段的起止时间";
      if (new Date(rule.rangeStartAt).getTime() >= new Date(rule.rangeEndAt).getTime()) {
        return "结束时间必须晚于开始时间";
      }
      return null;
    }
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
      const target = orderedRules[editIndex];
      const idx = rules.findIndex((r) => r === target);
      if (idx >= 0) rules[idx] = { ...target, ...nextRule };
    } else {
      rules.push(nextRule);
    }

    onChange({ ...draft, rules });
    resetForm();
  }

  /** 特殊时段：新建/编辑。固定全局开放，一次性区间过期后引擎自然不再命中 */
  function saveSpecial() {
    const err = validateFormRule(specialForm);
    if (err) {
      toast.error(err);
      return;
    }
    const next: AnimalOrderWindowRule = {
      ...specialForm,
      shape: "RANGE",
      effect: "OPEN",
      scope: "GLOBAL",
      categoryKey: null,
      weekdays: null,
      startWeekday: null,
      endWeekday: null,
      dailyStartTime: undefined,
      dailyEndTime: undefined,
      // 表单里是 datetime-local 值，落草稿前转成后端 WALL_CLOCK 格式
      rangeStartAt: toApiDateTime(specialForm.rangeStartAt),
      rangeEndAt: toApiDateTime(specialForm.rangeEndAt),
      active: 1,
    };
    const rules = [...(draft.rules ?? [])];
    if (specialEditIndex != null) {
      const target = orderedRules[specialEditIndex];
      const idx = rules.findIndex((r) => r === target);
      if (idx >= 0) rules[idx] = { ...target, ...next };
      onChange({ ...draft, rules });
    } else {
      // 特殊时段恒为最高优先级：自身 sortOrder=0，其余整体后移一位
      const shifted = rules.map((r) => ({ ...r, sortOrder: (r.sortOrder ?? 0) + 1 }));
      shifted.push({ ...next, sortOrder: 0 });
      onChange({ ...draft, rules: shifted });
    }
    resetSpecialForm();
  }

  function handleSave() {
    // 展示顺序即优先级顺序（特殊时段已在最前），整表重编号后提交。
    // RANGE 不经 toEditableForm：它进草稿时已是后端 WALL_CLOCK 格式，不能再转回输入框用的 T 形式。
    const ordered = orderedRules.map((r, i) => ({ ...r, sortOrder: i }));
    const normalizedRules = ordered.map((r) =>
      r.active === 0 || r.shape === "RANGE" ? r : toEditableForm(r),
    );
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

      {formVisible && (
      <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
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
        </div>
      )}

      {specialVisible && (
        <div className="space-y-3 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
          <div className="text-xs font-semibold text-[var(--twin-ink)]">
            {specialEditIndex != null ? "编辑特殊时段" : "新建特殊时段"}
          </div>
          <div className="text-[10px] text-[var(--twin-mute)]">
            特殊时段优先级最高（置顶）、全局开放，只在这一区间内开放加购；区间一过自动失效，无需手动关闭。
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--twin-mute)]">开始时间</span>
              <input
                type="datetime-local"
                value={specialForm.rangeStartAt ?? ""}
                onChange={(e) => setSpecialForm((f) => ({ ...f, rangeStartAt: e.target.value }))}
                className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--twin-mute)]">结束时间</span>
              <input
                type="datetime-local"
                value={specialForm.rangeEndAt ?? ""}
                onChange={(e) => setSpecialForm((f) => ({ ...f, rangeEndAt: e.target.value }))}
                className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--twin-mute)]">备注标签（可选）</span>
              <input
                type="text"
                value={specialForm.label ?? ""}
                onChange={(e) => setSpecialForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="如：节前补单"
                className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveSpecial}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
            >
              {specialEditIndex != null ? "更新特殊时段" : "添加特殊时段"}
            </button>
            <button
              type="button"
              onClick={resetSpecialForm}
              className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--twin-body)]">
            已有时段 ({activeRules.length})
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCreateSpecial}
              className="rounded-full border border-[var(--twin-hairline)] px-3 py-1 text-[11px] text-[var(--twin-body)] hover:border-[var(--twin-link)] hover:text-[var(--twin-link)]"
            >
              + 特殊时段
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-full bg-sky-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-sky-700"
            >
              + 新建时段
            </button>
          </div>
        </div>
        <div className="mb-1.5 text-[10px] text-[var(--twin-mute)]">
          从上到下优先级递减，命中即止；特殊时段恒在最顶且不可拖拽。
        </div>
        {orderedRules.length === 0 ? (
          <div className="py-4 text-center text-xs text-[var(--twin-mute)]">暂无时段</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={orderedRules.map((r, i) => rowId(r, i))}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {orderedRules.map((rule, index) => (
                  <SortableRuleRow
                    key={rowId(rule, index)}
                    id={rowId(rule, index)}
                    rule={rule}
                    scopeText={rule.shape === "RANGE" ? "特殊时段" : scopeLabel(rule)}
                    draggable={rule.shape !== "RANGE" && rule.active !== 0}
                    onEdit={() => openEdit(index)}
                    onToggleActive={() => toggleRuleActive(index)}
                    onDelete={() => void deleteRule(index)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
