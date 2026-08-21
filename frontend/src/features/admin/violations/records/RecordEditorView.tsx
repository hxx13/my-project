import { useMemo, type JSX } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { EditorInspectorLayout } from "../shared/EditorInspectorLayout";
import { InspectorGroup, InspectorRow } from "../shared/InspectorGroup";
import { BareInput } from "../shared/BareControl";
import { MultiSelectField } from "../shared/MultiSelectField";
import { SelectField } from "../shared/SelectField";
import { cn } from "@/lib/utils";
import { ContentBodySlot, contentBodyFromHtml, serializeContentBody } from "../slots/ContentBodySlot";
import { DispositionFieldsSlot } from "../slots/DispositionFieldsSlot";
import { DISPOSITION_FULL, validateDispositionForCreate } from "../slots/dispositionTypes";
import { ViolationTemplateQuickSelect } from "./ViolationTemplateQuickSelect";
import {
  useRecordForm,
  CAGE_STATUS_OPTIONS,
  type RecordEditorMode,
} from "./useRecordForm";

export type RecordEditorViewProps = {
  mode: RecordEditorMode;
  onDone: () => void;
  onCancel: () => void;
};

const SOURCE_OPTIONS = [
  { value: "manual", label: "手动新建" },
  { value: "cage", label: "笼架提交" },
] as const;

const LOCK_MODE_OPTIONS = [
  { value: "single", label: "单人锁定" },
  { value: "batch", label: "课题组批量" },
] as const;

export function RecordEditorView({ mode, onDone, onCancel }: RecordEditorViewProps): JSX.Element {
  const isEdit = mode.kind === "edit";
  const form = useRecordForm(mode);

  // 触发规则下拉：笼架来源只展示 CAGE_STATUS 规则，其余展示全部 enabled 规则
  const selectableRules = form.source === "cage"
    ? form.rules.filter((r) => r.sourceTag === "CAGE_STATUS" && r.enabled === 1)
    : form.rules.filter((r) => r.enabled === 1);

  const currentHtml = serializeContentBody(form.content).html;
  const templateSlot = (
    <ViolationTemplateQuickSelect
      currentText={currentHtml}
      onSelect={(text) => form.setContent((prev) => contentBodyFromHtml(text, serializeContentBody(prev).imageUrls))}
    />
  );

  const cageKey = form.cagePick
    ? `${form.cagePick.shelveId}-${form.cagePick.positionX}-${form.cagePick.positionY}`
    : "";

  const targetOk = isEdit
    ? true
    : form.lockMode === "single"
      ? Boolean(form.picked)
      : Boolean(form.selectedGroup) && form.batchSelectedIds.size > 0;
  const cageOk = form.source !== "cage" || Boolean(form.cageStatusCode.trim());
  const dispositionOk = isEdit || validateDispositionForCreate(form.disposition) == null;
  const canSubmit = targetOk && cageOk && dispositionOk;

  const personInvalid = !isEdit && form.showValidation && form.lockMode === "single" && !form.picked;
  const groupInvalid = !isEdit && form.showValidation && form.lockMode === "batch" && !form.selectedGroup;
  const membersInvalid =
    !isEdit && form.showValidation && form.lockMode === "batch" && Boolean(form.selectedGroup) && form.batchSelectedIds.size === 0;
  const cageStatusInvalid = form.showValidation && form.source === "cage" && !form.cageStatusCode.trim();

  const memberOptions = useMemo(
    () =>
      form.groupMembers.map((m) => ({
        value: m.userId,
        label: m.name || m.userId,
        desc: m.userId,
      })),
    [form.groupMembers],
  );
  const selectedMemberIds = useMemo(() => Array.from(form.batchSelectedIds), [form.batchSelectedIds]);

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <AdminButton type="button" tone="secondary" size="sm" className="shrink-0" onClick={onCancel}>
          ← 违规记录
        </AdminButton>
        <span className="text-[var(--app-color-text-tertiary)]">/</span>
        <span className="truncate text-[var(--app-color-text-secondary)]">{isEdit ? "编辑" : "开单"}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <AdminButton type="button" tone="secondary" disabled={form.submitting} onClick={onCancel}>
          取消
        </AdminButton>
        <AdminButton
          type="button"
          tone="primary"
          loading={form.submitting}
          onClick={() => {
            if (!canSubmit) form.setShowValidation(true);
            void form.submit().then((ok) => {
              if (ok) onDone();
            });
          }}
        >
          {isEdit ? "保存修改" : form.lockMode === "batch" ? `批量提交（${form.batchSelectedIds.size} 人）` : "提交违规记录"}
        </AdminButton>
      </div>
    </div>
  );

  const canvas = (
    <ContentBodySlot
      value={form.content}
      onChange={form.setContent}
      uploading={form.uploading}
      onPickFiles={form.onPickFiles}
      templateSlot={templateSlot}
      placeholder="支持富文本与插图，展示效果与「扫码弹窗公告」一致"
    />
  );

  const inspector = (
    <>
      <InspectorGroup title="对象">
        <InspectorRow label="来源">
          {(id) => (
            <SelectField id={id} options={SOURCE_OPTIONS} value={form.source} disabled={isEdit} onChange={(v) => form.setSource(v)} />
          )}
        </InspectorRow>

        <InspectorRow label="锁定方式">
          {(id) => (
            <SelectField id={id} options={LOCK_MODE_OPTIONS} value={form.lockMode} disabled={isEdit} onChange={(v) => form.setLockMode(v)} />
          )}
        </InspectorRow>

        {/* 人员/课题组紧挨锁定方式，避免笼架字段插在中间导致检索框被挤出视口 */}
        {!isEdit && form.lockMode === "single" && (
          <InspectorRow
            label="人员"
            required
            stack
            tone={personInvalid ? "error" : "default"}
            hint={personInvalid ? "请选择人员" : undefined}
          >
            {(controlId) => (
              form.picked ? (
                <div className="flex items-center gap-2 rounded-md border border-[var(--app-color-accent)]/40 bg-[var(--app-color-accent-soft)] p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[var(--app-color-text-primary)]">{form.picked.name}</div>
                    <div className="font-mono text-[10px] text-[var(--app-color-text-tertiary)]">{form.picked.userId}</div>
                  </div>
                  <AdminButton type="button" tone="secondary" size="sm" className="shrink-0" onClick={form.clearPicked}>
                    更换
                  </AdminButton>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <BareInput
                    id={controlId}
                    value={form.personKeyword}
                    onChange={(e) => form.onPersonKeywordChange(e.target.value)}
                    placeholder="姓名或工号"
                    autoComplete="off"
                    invalid={personInvalid}
                  />
                  {form.searchResult.length > 0 ? (
                    <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1">
                      {form.searchResult.map((rp) => {
                        const pid = String(rp.user_id ?? rp.userid ?? rp.userId ?? rp.id ?? "").trim();
                        const pname = String(rp.name ?? rp.username ?? "").trim() || pid;
                        return (
                          <button key={pid || pname} type="button" className="rounded-md px-2 py-1.5 text-left hover:bg-[var(--app-color-surface-hover)]" onClick={() => form.pickPerson(rp)}>
                            <span className="block truncate text-sm text-[var(--app-color-text-primary)]">{pname}</span>
                            <span className="font-mono text-[10px] text-[var(--app-color-text-tertiary)]">{pid}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              )
            )}
          </InspectorRow>
        )}

        {!isEdit && form.lockMode === "batch" && (
          <InspectorRow
            label="课题组"
            required
            stack
            tone={groupInvalid || membersInvalid ? "error" : "default"}
            hint={
              groupInvalid
                ? "请选择课题组"
                : membersInvalid
                  ? "请至少选择一名成员"
                  : undefined
            }
          >
            {(controlId) => (
              <div className="flex flex-col gap-1.5">
                {form.selectedGroup ? (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md border p-2",
                      groupInvalid || membersInvalid
                        ? "border-[var(--app-color-feedback-danger)] bg-[var(--app-color-feedback-danger-soft)]"
                        : "border-[var(--app-color-accent)]/40 bg-[var(--app-color-accent-soft)]",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[var(--app-color-text-primary)]">{form.selectedGroup}</div>
                      <div className="text-[10px] text-[var(--app-color-text-tertiary)]">
                        {form.groupMembersLoading ? "加载中…" : `共 ${form.groupMembers.length} 人，已选 ${form.batchSelectedIds.size} 人`}
                      </div>
                    </div>
                    <AdminButton type="button" tone="secondary" size="sm" className="shrink-0" onClick={form.resetBatchGroup}>
                      更换
                    </AdminButton>
                  </div>
                ) : (
                  <>
                    <BareInput
                      id={controlId}
                      value={form.groupKeyword}
                      onChange={(e) => form.onGroupKeywordChange(e.target.value)}
                      placeholder="检索课题组名称"
                      autoComplete="off"
                      invalid={groupInvalid}
                    />
                    {form.groupSearching ? (
                      <p className="px-1 text-[11px] text-[var(--app-color-text-tertiary)]">检索中…</p>
                    ) : null}
                    {!form.groupSearching && form.groupKeyword.trim() && form.groupSuggestions.length === 0 ? (
                      <p className="px-1 text-[11px] text-[var(--app-color-text-tertiary)]">无匹配课题组</p>
                    ) : null}
                    {form.groupSuggestions.length > 0 ? (
                      <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1">
                        {form.groupSuggestions.map((g) => (
                          <button
                            key={g}
                            type="button"
                            className="rounded-md px-2 py-1.5 text-left text-sm text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]"
                            onClick={() => form.pickProjectGroup(g)}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}

                {form.selectedGroup && !form.groupMembersLoading && form.groupMembers.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-medium text-[var(--app-color-text-secondary)]">
                        成员
                        <span className="ml-0.5 text-[var(--app-color-feedback-danger)]" aria-hidden>*</span>
                      </span>
                      <div className="flex gap-1.5">
                        <AdminButton type="button" tone="secondary" size="sm" onClick={form.selectAllMembers}>全选</AdminButton>
                        <AdminButton type="button" tone="secondary" size="sm" onClick={form.clearAllMembers}>清空</AdminButton>
                      </div>
                    </div>
                    <MultiSelectField
                      options={memberOptions}
                      value={selectedMemberIds}
                      onChange={form.setBatchSelectedMemberIds}
                      placeholder="选择课题组成员（可搜索）"
                      maxChips={3}
                      searchable
                      searchThreshold={0}
                      invalid={membersInvalid}
                    />
                  </div>
                ) : null}

                {form.selectedGroup && !form.groupMembersLoading && form.groupMembers.length === 0 ? (
                  <p className="text-xs text-[var(--app-color-feedback-warning)]">该课题组下未找到有效成员</p>
                ) : null}
              </div>
            )}
          </InspectorRow>
        )}

        {form.source === "cage" && (
          <>
            <InspectorRow
              label="笼位状态"
              required
              tone={cageStatusInvalid ? "error" : !form.cageStatusCode ? "warn" : "default"}
              hint={
                cageStatusInvalid
                  ? "请选择笼位状态"
                  : !form.cageStatusCode
                    ? "必选"
                    : isEdit
                      ? "课题组批量下多名成员共享同一父记录，修改会影响同组"
                      : undefined
              }
            >
              {(id) => (
                <SelectField
                  id={id}
                  options={CAGE_STATUS_OPTIONS}
                  value={form.cageStatusCode}
                  onChange={(v) => form.setCageStatusCode(v)}
                  placeholder="请选择笼位状态"
                  invalid={cageStatusInvalid}
                />
              )}
            </InspectorRow>
            <InspectorRow label="笼位">
              {(id) => (
                <SelectField
                  id={id}
                  options={form.cageOptions}
                  value={cageKey}
                  onChange={(v) => form.setCagePick(form.cageOptions.find((o) => o.value === v)?.detail ?? null)}
                  placeholder={form.cageStatusCode ? "不指定具体笼位" : "请先选择笼位状态"}
                  disabled={!form.cageStatusCode}
                />
              )}
            </InspectorRow>
          </>
        )}

        {!isEdit && (
          <InspectorRow label="触发规则">
            {(id) => (
              <SelectField
                id={id}
                options={selectableRules.flatMap((r) => (r.id != null ? [{ value: r.id, label: r.ruleName }] : []))}
                value={form.ruleId ?? ""}
                onChange={(v) => form.setRuleId(v)}
                placeholder="默认（手动规则）"
              />
            )}
          </InspectorRow>
        )}
      </InspectorGroup>

      <DispositionFieldsSlot
        value={form.disposition}
        onChange={form.setDisposition}
        capability={DISPOSITION_FULL}
        expiryMode={isEdit ? "edit" : "create"}
        showValidation={!isEdit && form.showValidation}
      />
    </>
  );

  return (
    <EditorInspectorLayout breadcrumb={header} canvas={canvas} inspector={inspector} />
  );
}
