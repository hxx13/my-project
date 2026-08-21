import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, List, Pencil, Plus, Save, Trash2 } from "lucide-react";
import type { ViolationRule } from "@/api/domains/studentViolation.api";
import type { SpecialStatusOverview } from "@/api/domains/cageShelf.api";
import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import { ConfigModalShell } from "../ConfigModal/ConfigModalShell";
import { EditorInspectorLayout } from "../shared/EditorInspectorLayout";
import { InspectorGroup, InspectorRow } from "../shared/InspectorGroup";
import { BareNumberWithUnit, bareControlClass } from "../shared/BareControl";
import { MultiSelectField } from "../shared/MultiSelectField";
import { SelectField } from "../shared/SelectField";
import type { MultiSelectOption } from "../shared/multiSelectModel";
import { ContentBodySlot, contentBodyFromHtml, serializeContentBody } from "../slots/ContentBodySlot";
import { DispositionFieldsSlot } from "../slots/DispositionFieldsSlot";
import { DISPOSITION_RULE_LEVEL } from "../slots/dispositionTypes";
import { dispositionToRulePatch, ruleToDisposition } from "./ruleDisposition";
import { useCageRuleForm } from "./useCageRuleForm";

const STATUS_LABEL: Record<string, string> = {
  COHABITATION: "合笼/繁殖",
  SPECIAL_FEEDING: "特殊饲养",
  NEED_DIVIDE: "请分笼/密度超标",
  HEALTH_ABNORMAL: "动物健康异常",
  ANIMAL_TRANSFER: "动物转移",
};
const STATUS_OPTIONS: MultiSelectOption<string>[] = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));

const JUDGE_MODES = [
  { value: "AUTO_SYNC_LINKED", label: "自动同步联动" },
  { value: "PURE_DAYS", label: "纯天数" },
  { value: "PURE_MANUAL", label: "纯手动" },
] as const;

const TRIGGER_ACTIONS = [
  { value: "VIOLATION_ONLY", label: "仅违规" },
  { value: "NOTICE_ONLY", label: "仅公告" },
  { value: "BOTH", label: "两者" },
] as const;

const JUDGE_MODE_LABEL: Record<string, string> = { AUTO_SYNC_LINKED: "同步联动", PURE_DAYS: "纯天数", PURE_MANUAL: "纯手动" };
const TRIGGER_ACTION_LABEL: Record<string, string> = { VIOLATION_ONLY: "仅违规", NOTICE_ONLY: "仅公告", BOTH: "两者" };

/** 从总览推导各笼架字段的可选项（园区 / 课题组），去重排序。 */
function uniqueCageValues(overview: SpecialStatusOverview | undefined, key: "campusName" | "projectPiName"): MultiSelectOption<string>[] {
  const set = new Set<string>();
  (overview?.groups ?? []).forEach((g) => g.cages.forEach((c) => { const v = c[key]; if (v) set.add(v); }));
  return Array.from(set).sort().map((v) => ({ value: v, label: v }));
}

function SpecialStatusPickerModal({ open, initial, overview, onConfirm, onClose }: {
  open: boolean;
  initial: string[];
  overview?: SpecialStatusOverview;
  onConfirm: (codes: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  useEffect(() => { if (open) setSelected(initial); }, [open, initial]);
  if (!open) return null;
  const toggle = (code: string) => setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] [box-shadow:var(--app-elevation-modal)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--app-color-border-default)] px-5 py-3">
          <div>
            <div className="text-base font-semibold text-[var(--app-color-text-primary)]">选择监控状态</div>
            <div className="text-[11px] text-[var(--app-color-text-secondary)]">按课题组维度展示各状态命中的课题组与笼位</div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-full p-1.5 text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]">✕</button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {STATUS_OPTIONS.map((s) => {
            const group = (overview?.groups ?? []).find((g) => g.statusCode === s.value);
            const groups = Array.from(new Set((group?.cages ?? []).map((c) => c.projectPiName).filter(Boolean)));
            const checked = selected.includes(s.value);
            return (
              <label key={s.value} className={cn("flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2", checked ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent-soft)]" : "border-[var(--app-color-border-default)]")}>
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(s.value)} />
                <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none", checked ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)] text-white" : "border-[var(--app-color-border-strong)] text-transparent")}>✓</span>
                <span className="min-w-0">
                  <span className="block text-sm text-[var(--app-color-text-primary)]">{s.label}</span>
                  <span className="block text-[11px] text-[var(--app-color-text-secondary)]">
                    课题组：{groups.length > 0 ? groups.slice(0, 3).join("、") + (groups.length > 3 ? ` 等 ${groups.length} 个` : "") : "无"}
                    {group ? ` · ${group.count} 个笼位` : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t border-[var(--app-color-border-default)] px-5 py-4">
          <AdminButton type="button" tone="secondary" onClick={onClose}>取消</AdminButton>
          <AdminButton type="button" tone="primary" disabled={selected.length === 0} onClick={() => onConfirm(selected)}>确定{selected.length > 0 ? `（${selected.length}）` : ""}</AdminButton>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function CageRulePanel(): JSX.Element {
  const {
    form, setForm, editingId, loadForEdit, reset,
    statusPickerOpen, openStatusPicker, closeStatusPicker, confirmStatusPick,
    saving, save, remove, manualTrigger,
    rules, rulesLoading, specialStatus, imageFiles, setImageFiles, uploading,
  } = useCageRuleForm();

  const cageRules = rules.filter((r) => r.sourceTag === "CAGE_STATUS");
  const [rulesOpen, setRulesOpen] = useState(false);
  const isEditing = editingId != null;
  const isAutoSync = (form.cageJudgeMode ?? "AUTO_SYNC_LINKED") === "AUTO_SYNC_LINKED";
  const selectedCodes = form.cageStatusCodes ?? [];
  const body = useMemo(() => contentBodyFromHtml(form.violationTextTpl, form.cageImageUrls), [form.violationTextTpl, form.cageImageUrls]);
  const disposition = useMemo(() => ruleToDisposition(form), [form]);
  const campusOptions = useMemo(() => uniqueCageValues(specialStatus, "campusName"), [specialStatus]);
  const groupOptions = useMemo(() => uniqueCageValues(specialStatus, "projectPiName"), [specialStatus]);

  const canvas = (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-3">
          <input value={form.ruleName} onChange={(e) => setForm({ ruleName: e.target.value })} placeholder="规则名称（例如：健康异常笼架违规）" className="min-w-0 flex-1 border-b border-[var(--app-color-border-default)] bg-transparent text-xl font-semibold text-[var(--app-color-text-primary)] outline-none transition-colors placeholder:text-[var(--app-color-text-tertiary)] hover:border-[var(--app-color-border-strong)] focus:border-[var(--app-color-accent)]" />
          <label className="flex shrink-0 items-center gap-2 text-xs text-[var(--app-color-text-secondary)]">
            <AdminSwitchScaled size="sm" checked={form.enabled === 1} disabled={saving} onChange={(checked) => setForm({ enabled: checked ? 1 : 0 })} />
            启用
          </label>
        </div>
        <p className="mt-1 text-xs text-[var(--app-color-text-secondary)]">触发条件与违规模板；人员锁定请使用「新建违规」的笼架提交来源。可用变量：{"${name} ${dept} ${status} ${cage} ${date}"}</p>
      </div>
      <ContentBodySlot
        value={body}
        onChange={(next) => { const { html, imageUrls } = serializeContentBody(next); setForm({ violationTextTpl: html, cageImageUrls: imageUrls }); }}
        onPickFiles={(files) => { if (files?.length) setImageFiles(Array.from(files)); }}
        uploading={uploading}
        disabled={saving}
        placeholder="留空则使用系统默认文案"
      />
      {imageFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {imageFiles.map((f, i) => (
            <div key={`${f.name}-${i}`} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-[var(--app-color-border-default)]">
              <img src={URL.createObjectURL(f)} alt={f.name} className="h-full w-full object-cover" />
              <button type="button" aria-label="移除图片" onClick={() => setImageFiles((prev) => prev.filter((_, j) => j !== i))} className="absolute right-0 top-0 rounded-bl bg-[var(--app-color-feedback-danger)] px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const inspector = (
    <>
      <InspectorGroup title="触发条件">
        <InspectorRow stack label="监控状态" hint="点击选择要监控的特殊状态类型">
          <button type="button" onClick={openStatusPicker} className={cn(bareControlClass, "flex w-full flex-wrap items-center gap-1 py-1 text-left")}>
            {selectedCodes.length === 0 ? (
              <span className="text-[var(--app-color-text-tertiary)]">未选择</span>
            ) : (
              selectedCodes.map((c) => <span key={c} className="rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-1.5 py-0.5 text-xs leading-none text-[var(--app-color-text-primary)]">{STATUS_LABEL[c] ?? c}</span>)
            )}
            <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--app-color-text-secondary)]" />
          </button>
        </InspectorRow>
        <InspectorRow label="判定模式">
          {(id) => <SelectField id={id} options={JUDGE_MODES} value={form.cageJudgeMode ?? "AUTO_SYNC_LINKED"} onChange={(v) => setForm({ cageJudgeMode: v as ViolationRule["cageJudgeMode"] })} />}
        </InspectorRow>
        <InspectorRow label="延迟天数">
          {(id) => <BareNumberWithUnit id={id} value={form.cageDelayDays == null ? "" : String(form.cageDelayDays)} onChange={(raw) => setForm({ cageDelayDays: Number(raw) || 7 })} unit="天" placeholder="7" disabled={saving} />}
        </InspectorRow>
        <InspectorRow stack label="园区范围" hint="空 = 所有园区">
          {(id) => <MultiSelectField id={id} options={campusOptions} value={form.cageAreaFilter?.campuses ?? []} onChange={(next) => setForm({ cageAreaFilter: { ...form.cageAreaFilter, campuses: next } })} placeholder="所有园区" disabled={saving} />}
        </InspectorRow>
        <InspectorRow stack label="课题组白名单" hint="空 = 不限课题组">
          {(id) => <MultiSelectField id={id} options={groupOptions} value={form.cageGroupWhitelist ?? []} onChange={(next) => setForm({ cageGroupWhitelist: next })} placeholder="不限" disabled={saving} />}
        </InspectorRow>
        {isAutoSync && (
          <InspectorRow label="手动执行也触发">
            {(id) => <AdminSwitchScaled id={id} size="sm" checked={form.cageManualTrigger === 1} disabled={saving} onChange={(checked) => setForm({ cageManualTrigger: checked ? 1 : 0 })} />}
          </InspectorRow>
        )}
        <InspectorRow label="触发动作">
          {(id) => <SelectField id={id} options={TRIGGER_ACTIONS} value={form.cageTriggerAction ?? "BOTH"} onChange={(v) => setForm({ cageTriggerAction: v as ViolationRule["cageTriggerAction"] })} />}
        </InspectorRow>
      </InspectorGroup>
      <DispositionFieldsSlot value={disposition} onChange={(next) => setForm(dispositionToRulePatch(next))} capability={DISPOSITION_RULE_LEVEL} disabled={saving} />
    </>
  );

  const rulesTable = (
    <AdminTableShell loading={rulesLoading} empty={!rulesLoading && cageRules.length === 0} emptyMessage="暂无笼架联动规则">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-tertiary)]">
            <th className="px-3 py-2">规则名称</th>
            <th className="px-3 py-2">监控状态</th>
            <th className="px-3 py-2">判定模式</th>
            <th className="px-3 py-2">延迟</th>
            <th className="px-3 py-2">触发</th>
            <th className="px-3 py-2">状态</th>
            <th className="px-3 py-2 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {cageRules.map((r) => (
            <tr key={r.id} className={cn("border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]", editingId === r.id && "bg-[var(--app-color-accent-soft)]")}>
              <td className="px-3 py-2 font-semibold text-[var(--app-color-text-primary)]">{r.ruleName}</td>
              <td className="px-3 py-2 text-xs text-[var(--app-color-text-secondary)]">{(r.cageStatusCodes ?? []).map((c) => STATUS_LABEL[c] ?? c).join(", ") || "-"}</td>
              <td className="px-3 py-2 text-xs">{JUDGE_MODE_LABEL[r.cageJudgeMode ?? ""] ?? "-"}</td>
              <td className="px-3 py-2 text-xs">{r.cageDelayDays ?? "-"} 天</td>
              <td className="px-3 py-2 text-xs">{TRIGGER_ACTION_LABEL[r.cageTriggerAction ?? ""] ?? "-"}</td>
              <td className="px-3 py-2 text-xs">{r.enabled === 1 ? "启用" : "停用"}</td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                <AdminButton size="sm" onClick={() => { if (r.id != null) { loadForEdit(r.id); setRulesOpen(false); } }}><Pencil className="mr-0.5 h-3.5 w-3.5" />编辑</AdminButton>
                {r.cageJudgeMode === "PURE_MANUAL" && <AdminButton size="sm" tone="secondary" onClick={() => r.id != null && manualTrigger(r.id)}>立即执行</AdminButton>}
                <AdminButton size="sm" tone="destructive" onClick={() => r.id != null && remove(r.id)}><Trash2 className="mr-0.5 h-3.5 w-3.5" />删除</AdminButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminTableShell>
  );

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <AdminButton type="button" tone="secondary" className="gap-1.5" onClick={() => setRulesOpen(true)}>
        <List className="h-4 w-4" /> 已有规则（{cageRules.length}）
      </AdminButton>
      <div className="flex gap-3">
        {isEditing && <AdminButton type="button" tone="secondary" onClick={reset}>取消编辑</AdminButton>}
        <AdminButton type="button" tone="primary" loading={saving} disabled={saving} className="gap-1.5" onClick={() => void save()}><Save className="h-4 w-4" /> {saving ? "保存中…" : isEditing ? "更新规则" : "保存规则"}</AdminButton>
      </div>
    </div>
  );

  return (
    <>
      <EditorInspectorLayout canvas={canvas} inspector={inspector} footer={footer} />
      <SpecialStatusPickerModal open={statusPickerOpen} initial={selectedCodes} overview={specialStatus} onConfirm={confirmStatusPick} onClose={closeStatusPicker} />
      <ConfigModalShell
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        ariaLabel="已有笼架联动规则"
        fill
        dialogClassName="max-w-[min(760px,94vw)]"
        header={
          <div>
            <div className="text-[15px] font-semibold text-[var(--app-color-text-primary)]">已有笼架联动规则</div>
            <div className="text-[11px] text-[var(--app-color-text-secondary)]">点击「编辑」加载到表单修改；删除或新建后返回配置表单。</div>
          </div>
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">{rulesTable}</div>
        <div className="flex shrink-0 justify-end border-t border-[var(--app-color-border-default)] px-4 py-3">
          <AdminButton type="button" tone="primary" className="gap-1.5" onClick={() => { reset(); setRulesOpen(false); }}>
            <Plus className="h-4 w-4" /> 新建规则
          </AdminButton>
        </div>
      </ConfigModalShell>
    </>
  );
}
