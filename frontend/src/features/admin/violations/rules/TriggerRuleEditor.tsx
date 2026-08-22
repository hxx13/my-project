import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Save } from "lucide-react";
import { createViolationRule, listViolationRules, updateViolationRule, type ViolationRule } from "@/api/domains/studentViolation.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { cn } from "@/lib/utils";
import { EditorInspectorLayout } from "../shared/EditorInspectorLayout";
import { InspectorGroup, InspectorRow } from "../shared/InspectorGroup";
import { BareInput, BareNumberWithUnit, bareControlClass } from "../shared/BareControl";
import { SelectField } from "../shared/SelectField";
import { violationContentTemplateSlot } from "../shared/violationContentTemplateSlot";
import { ContentBodySlot, contentBodyFromHtml, serializeContentBody } from "../slots/ContentBodySlot";
import { DispositionFieldsSlot } from "../slots/DispositionFieldsSlot";
import { DISPOSITION_RULE_LEVEL } from "../slots/dispositionTypes";
import { RULE_CATEGORIES, detectCategory } from "./ruleCategories";
import { dispositionToRulePatch, ruleToDisposition } from "./ruleDisposition";

export type TriggerRuleEditorProps = { ruleId: number | null; onDone: () => void; onCancel: () => void };

/** 新建规则默认值。解禁管控与只存不读字段沿用既有默认，行为配置（文案/禁入/过期）由插槽承载。 */
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

/** 解禁方式选项（单选下拉）。 */
const UNBLOCK_METHODS = [
  { value: "自助解禁", label: "自助解禁（用户拼图验证）" },
  { value: "仅工作人员", label: "仅工作人员" },
];

export function TriggerRuleEditor({ ruleId, onDone, onCancel }: TriggerRuleEditorProps): JSX.Element {
  const { data: rules = [] } = useQuery({ queryKey: ["violation-rules"], queryFn: () => listViolationRules(), enabled: ruleId != null });
  const existing = ruleId != null ? rules.find((r) => r.id === ruleId) : undefined;
  const isNew = ruleId == null;

  const [form, setForm] = useState<ViolationRule>(() => (existing ? { ...existing } : emptyRule()));
  const hydrated = useRef(existing != null);
  useEffect(() => {
    if (existing && !hydrated.current) {
      setForm({ ...existing });
      hydrated.current = true;
    }
  }, [existing]);

  const set = (patch: Partial<ViolationRule>) => setForm((prev) => ({ ...prev, ...patch }));

  const saveMu = useMutation({
    mutationFn: (body: ViolationRule) => (isNew ? createViolationRule(body) : updateViolationRule(ruleId!, body)),
    onSuccess: () => {
      toast.success(isNew ? "规则已创建" : "规则已更新");
      onDone();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message || "保存失败"),
  });

  const category = detectCategory(form.sourceTag);
  const isCustom = category === "自定义";
  const handleCategoryChange = (cat: string) => {
    const found = RULE_CATEGORIES.find((c) => c.value === cat);
    if (found) set({ sourceTag: found.sourceTag });
  };

  const body = useMemo(() => contentBodyFromHtml(form.violationTextTpl, null), [form.violationTextTpl]);
  const disposition = useMemo(() => ruleToDisposition(form), [form]);
  const unblockMethodHint =
    form.unblockMethod === "自助解禁" ? "用户可在扫码弹窗中完成拼图自行解除" : "用户无法自助操作，必须由管理员后台解除";
  const unblockMaxHint =
    form.unblockMaxCount != null ? `窗口内达到 ${form.unblockMaxCount} 次后强制禁入，自助关闭` : "不限制解禁次数";
  const windowHint =
    form.unblockWindowType === "滑动窗口"
      ? `从现在往前推 ${form.unblockWindowValue ?? 30} 天内的违规记录参与计数`
      : form.unblockWindowStart && form.unblockWindowEnd
        ? `每年 ${form.unblockWindowStart} 至 ${form.unblockWindowEnd} 内的记录参与计数`
        : "请设置起止日期";

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <AdminButton type="button" tone="secondary" size="sm" className="shrink-0" onClick={onCancel}>
          ← 触发规则
        </AdminButton>
        <span className="text-[var(--app-color-text-tertiary)]">/</span>
        <span className="truncate text-[var(--app-color-text-secondary)]">{isNew ? "新建" : "编辑"}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <AdminButton type="button" tone="secondary" disabled={saveMu.isPending} onClick={onCancel}>
          取消
        </AdminButton>
        <AdminButton type="button" tone="primary" loading={saveMu.isPending} disabled={!form.ruleName.trim()} className="gap-1.5" onClick={() => saveMu.mutate(form)}>
          <Save className="h-4 w-4" />
          {saveMu.isPending ? "保存中…" : "保存规则"}
        </AdminButton>
      </div>
    </div>
  );

  const canvas = (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-3">
          <input
            value={form.ruleName}
            onChange={(e) => set({ ruleName: e.target.value })}
            placeholder="规则名称（例如：手动违规）"
            className="min-w-0 flex-1 border-b border-[var(--app-color-border-default)] bg-transparent text-xl font-semibold text-[var(--app-color-text-primary)] outline-none transition-colors placeholder:text-[var(--app-color-text-tertiary)] hover:border-[var(--app-color-border-strong)] focus:border-[var(--app-color-accent)]"
          />
          <label className="flex shrink-0 items-center gap-2 text-xs text-[var(--app-color-text-secondary)]">
            <AdminSwitchScaled size="sm" checked={form.enabled === 1} disabled={saveMu.isPending} onChange={(checked) => set({ enabled: checked ? 1 : 0 })} />
            启用
          </label>
        </div>
        <p className="mt-1 text-xs text-[var(--app-color-text-secondary)]">违规文案模板；可用变量：{"${name} ${dept} ${date}"}。</p>
      </div>
      <ContentBodySlot
        value={body}
        onChange={(next) => set({ violationTextTpl: serializeContentBody(next).html })}
        onPickFiles={() => {}}
        disabled={saveMu.isPending}
        placeholder="留空则使用系统默认文案"
        templateSlot={violationContentTemplateSlot(body, (next) => set({ violationTextTpl: serializeContentBody(next).html }))}
      />
    </div>
  );

  const inspector = (
    <>
      <InspectorGroup title="基本信息">
        <InspectorRow label="规则类型" hint="选择类型后自动关联对应的触发来源，违规记录将归入此规则计数">
          {(id) => (
            <SelectField id={id} options={RULE_CATEGORIES} value={category} disabled={!isNew} onChange={(v) => handleCategoryChange(v)} />
          )}
        </InspectorRow>
        {isCustom && (
          <InspectorRow label="来源标识" hint="自定义规则的技术标识（source_tag）">
            {(id) => <BareInput id={id} value={form.sourceTag || ""} onChange={(e) => set({ sourceTag: e.target.value })} placeholder="自定义标签" />}
          </InspectorRow>
        )}
      </InspectorGroup>

      <InspectorGroup title="解禁管控">
        <InspectorRow label="解禁方式" hint={unblockMethodHint}>
          {(id) => (
            <SelectField id={id} options={UNBLOCK_METHODS} value={form.unblockMethod} onChange={(v) => set({ unblockMethod: v as ViolationRule["unblockMethod"] })} />
          )}
        </InspectorRow>
        <InspectorRow label="上限次数" hint={unblockMaxHint}>
          {(id) => (
            <BareNumberWithUnit
              id={id}
              value={form.unblockMaxCount == null ? "" : String(form.unblockMaxCount)}
              onChange={(raw) => set({ unblockMaxCount: raw.trim() === "" ? null : Math.max(0, Number(raw)) })}
              unit="次"
              placeholder="不限"
            />
          )}
        </InspectorRow>
        <InspectorRow stack label="计数时间窗口" hint={windowHint}>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-[var(--app-color-text-primary)]">
              <input type="radio" name="windowType" checked={form.unblockWindowType === "滑动窗口"} onChange={() => set({ unblockWindowType: "滑动窗口", unblockWindowStart: undefined, unblockWindowEnd: undefined })} />
              滑动：最近
              <input className={cn(bareControlClass, "w-16 text-center")} type="number" min={1} value={form.unblockWindowValue ?? 30} onChange={(e) => set({ unblockWindowValue: Number(e.target.value) || 30 })} disabled={form.unblockWindowType !== "滑动窗口"} />
              天
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--app-color-text-primary)]">
              <input type="radio" name="windowType" checked={form.unblockWindowType === "固定周期"} onChange={() => set({ unblockWindowType: "固定周期", unblockWindowValue: undefined })} />
              固定：每年
              <input className={cn(bareControlClass, "w-20 text-center font-mono")} placeholder="03-01" maxLength={5} value={form.unblockWindowStart || ""} onChange={(e) => set({ unblockWindowStart: e.target.value })} disabled={form.unblockWindowType !== "固定周期"} />
              至
              <input className={cn(bareControlClass, "w-20 text-center font-mono")} placeholder="07-01" maxLength={5} value={form.unblockWindowEnd || ""} onChange={(e) => set({ unblockWindowEnd: e.target.value })} disabled={form.unblockWindowType !== "固定周期"} />
            </label>
          </div>
        </InspectorRow>
        {form.unblockMaxCount != null && (
          <InspectorRow stack label="达到上限时的替换公告" hint="达到上限次数后，扫码弹窗的公告内容将替换为此文案。可用变量：${name} ${dept} ${date}">
            <textarea
              className="w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-1.5 text-sm text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]"
              rows={3}
              value={form.criticalNoticeText || ""}
              onChange={(e) => set({ criticalNoticeText: e.target.value || undefined })}
              placeholder={`例如：\${name}，你已累计违规 ${form.unblockMaxCount} 次，请立即联系管理员处理`}
            />
          </InspectorRow>
        )}
        <div className="rounded-md border border-[var(--app-color-feedback-warning)]/30 bg-[var(--app-color-feedback-warning-soft)] p-3">
          <p className="text-[11px] leading-snug text-[var(--app-color-text-primary)]">
            <strong className="text-[var(--app-color-feedback-warning)]">上限行为：</strong>
            窗口内违规次数达到上限后，<strong>强制禁止进入</strong>
            {form.unblockMethod === "自助解禁" && "，自助拼图通道关闭"}。此时只能由工作人员后台解除。
          </p>
        </div>
      </InspectorGroup>

      <DispositionFieldsSlot value={disposition} onChange={(next) => set(dispositionToRulePatch(next))} capability={DISPOSITION_RULE_LEVEL} disabled={saveMu.isPending} />

      <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-3">
        <p className="text-xs leading-relaxed text-[var(--app-color-text-secondary)]">
          定时执行字段（cronExpression、lastExecutionAt、lastExecutionResult、autoSignoutEnabled、部门白名单 whitelistDepts）当前未接线，期 5 接入；配置后暂不生效。每次扫码提示（showNoticeEveryScan）当前也无编辑入口，默认每次提示。
        </p>
      </div>
    </>
  );

  return <EditorInspectorLayout breadcrumb={header} canvas={canvas} inspector={inspector} />;
}
