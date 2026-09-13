import { useMemo, useState } from "react";
import type { JSX } from "react";
import { List, Pencil, Plus, Save, Trash2 } from "lucide-react";
import type { ViolationRule } from "@/api/domains/studentViolation.api";
import type { SpecialStatusOverview } from "@/api/domains/cageShelf.api";
import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import { ConfigModalShell } from "../ConfigModal/ConfigModalShell";
import { SettingsSection, SettingsRow, SettingsSwitch } from "@/features/cage-shelf/components/SettingsPrimitives";
import { MultiSelectField } from "../shared/MultiSelectField";
import { SelectField } from "../shared/SelectField";
import type { MultiSelectOption } from "../shared/multiSelectModel";
import { violationContentTemplateSlot } from "../shared/violationContentTemplateSlot";
import { ContentBodySlot, contentBodyFromHtml, serializeContentBody } from "../slots/ContentBodySlot";
import { DispositionFieldsSlot } from "../slots/DispositionFieldsSlot";
import { DISPOSITION_RULE_LEVEL } from "../slots/dispositionTypes";
import { dispositionToRulePatch, ruleToDisposition } from "./ruleDisposition";
import { useCageRuleForm } from "./useCageRuleForm";

const TRIGGER_ACTIONS = [
  { value: "VIOLATION_ONLY", label: "仅违规" },
  { value: "NOTICE_ONLY", label: "仅公告" },
  { value: "BOTH", label: "两者" },
] as const;

const TRIGGER_ACTION_LABEL: Record<string, string> = { VIOLATION_ONLY: "仅违规", NOTICE_ONLY: "仅公告", BOTH: "两者" };

/** 从总览推导各笼架字段的可选项（校区 / 课题组），去重排序。 */
function uniqueCageValues(overview: SpecialStatusOverview | undefined, key: "campusName" | "projectPiName"): MultiSelectOption<string>[] {
  const set = new Set<string>();
  (overview?.groups ?? []).forEach((g) => g.cages.forEach((c) => { const v = c[key]; if (v) set.add(v); }));
  return Array.from(set).sort().map((v) => ({ value: v, label: v }));
}

export function CageRulePanel(): JSX.Element {
  const {
    form, setForm, editingId, loadForEdit, reset,
    saving, save, remove,
    rules, rulesLoading, specialStatus, imageFiles, setImageFiles, uploading,
  } = useCageRuleForm();

  const cageRules = rules.filter((r) => r.sourceTag === "CAGE_STATUS");
  const [rulesOpen, setRulesOpen] = useState(false);
  const isEditing = editingId != null;
  const body = useMemo(() => contentBodyFromHtml(form.violationTextTpl, form.cageImageUrls), [form.violationTextTpl, form.cageImageUrls]);
  const disposition = useMemo(() => ruleToDisposition(form), [form]);
  const campusOptions = useMemo(() => uniqueCageValues(specialStatus, "campusName"), [specialStatus]);
  const groupOptions = useMemo(() => uniqueCageValues(specialStatus, "projectPiName"), [specialStatus]);

  const content = (
    <div className="space-y-5">
      <div className="rounded-twin-sm border border-[color-mix(in_srgb,var(--twin-primary)_25%,transparent)] bg-[color-mix(in_srgb,var(--twin-primary)_6%,transparent)] px-3 py-2.5">
        <p className="text-[11px] leading-relaxed text-[var(--twin-ink)]">
          触发时机已迁到告警系统：请在「设置中心 → 状态告警」或「我的区域 → 告警阈值」里配置（区域级阈值，动作勾选「违规」才会发）。本面板只负责触发后发什么——文案 / 图片 / 处置 / 触发动作 / 范围过滤。
        </p>
      </div>

      <SettingsSection title="规则信息" description="规则名称与启用状态；启用后作为告警联动的违规模板来源。">
        <div className="space-y-2.5">
          <input
            value={form.ruleName}
            onChange={(e) => setForm({ ruleName: e.target.value })}
            placeholder="规则名称（例如：健康异常笼架违规）"
            className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-[13px] font-semibold text-[var(--twin-ink)] outline-none transition-colors placeholder:text-[var(--twin-mute)] focus:border-[var(--twin-primary)]"
          />
          <SettingsRow label="启用" description="关闭后不参与告警联动，也不在预填中命中">
            <SettingsSwitch checked={form.enabled === 1} disabled={saving} onChange={(checked) => setForm({ enabled: checked ? 1 : 0 })} label="启用" />
          </SettingsRow>
        </div>
      </SettingsSection>

      <SettingsSection
        title="模板文案"
        description={`留空则使用系统默认文案。可用变量：\${name} \${dept} \${status} \${cage} \${date}`}
      >
        <ContentBodySlot
          value={body}
          onChange={(next) => { const { html, imageUrls } = serializeContentBody(next); setForm({ violationTextTpl: html, cageImageUrls: imageUrls }); }}
          onPickFiles={(files) => { if (files?.length) setImageFiles(Array.from(files)); }}
          uploading={uploading}
          disabled={saving}
          placeholder="留空则使用系统默认文案"
          templateSlot={violationContentTemplateSlot(body, (next) => {
            const { html, imageUrls } = serializeContentBody(next);
            setForm({ violationTextTpl: html, cageImageUrls: imageUrls });
          })}
        />
        {imageFiles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {imageFiles.map((f, i) => (
              <div key={`${f.name}-${i}`} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)]">
                <img src={URL.createObjectURL(f)} alt={f.name} className="h-full w-full object-cover" />
                <button type="button" aria-label="移除图片" onClick={() => setImageFiles((prev) => prev.filter((_, j) => j !== i))} className="absolute right-0 top-0 rounded-bl bg-[var(--app-color-feedback-danger)] px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">✕</button>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="触发动作与范围" description="决定告警命中后发什么、发给哪些笼位。">
        <div className="space-y-2">
          <SettingsRow label="触发动作" description="仅违规 / 仅公告 / 两者">
            <div className="w-44">
              <SelectField options={TRIGGER_ACTIONS} value={form.cageTriggerAction ?? "BOTH"} onChange={(v) => setForm({ cageTriggerAction: v as ViolationRule["cageTriggerAction"] })} />
            </div>
          </SettingsRow>
          <SettingsRow label="校区范围" description="空 = 所有校区">
            <div className="w-44">
              <MultiSelectField options={campusOptions} value={form.cageAreaFilter?.campuses ?? []} onChange={(next) => setForm({ cageAreaFilter: { ...form.cageAreaFilter, campuses: next } })} placeholder="所有校区" disabled={saving} />
            </div>
          </SettingsRow>
          <SettingsRow label="课题组白名单" description="空 = 不限课题组">
            <div className="w-44">
              <MultiSelectField options={groupOptions} value={form.cageGroupWhitelist ?? []} onChange={(next) => setForm({ cageGroupWhitelist: next })} placeholder="不限" disabled={saving} />
            </div>
          </SettingsRow>
        </div>
      </SettingsSection>

      <DispositionFieldsSlot value={disposition} onChange={(next) => setForm(dispositionToRulePatch(next))} capability={DISPOSITION_RULE_LEVEL} disabled={saving} />
    </div>
  );

  const rulesTable = (
    <AdminTableShell loading={rulesLoading} empty={!rulesLoading && cageRules.length === 0} emptyMessage="暂无笼架联动规则">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--app-color-border-default)] text-xs text-[var(--app-color-text-tertiary)]">
            <th className="px-3 py-2">规则名称</th>
            <th className="px-3 py-2">触发</th>
            <th className="px-3 py-2">状态</th>
            <th className="px-3 py-2 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {cageRules.map((r) => (
            <tr key={r.id} className={cn("border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]", editingId === r.id && "bg-[var(--app-color-accent-soft)]")}>
              <td className="px-3 py-2 font-semibold text-[var(--app-color-text-primary)]">{r.ruleName}</td>
              <td className="px-3 py-2 text-xs">{TRIGGER_ACTION_LABEL[r.cageTriggerAction ?? ""] ?? "-"}</td>
              <td className="px-3 py-2 text-xs">{r.enabled === 1 ? "启用" : "停用"}</td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                <AdminButton size="sm" onClick={() => { if (r.id != null) { loadForEdit(r.id); setRulesOpen(false); } }}><Pencil className="mr-0.5 h-3.5 w-3.5" />编辑</AdminButton>
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
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">{content}</div>
        <div className="shrink-0">{footer}</div>
      </div>
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
