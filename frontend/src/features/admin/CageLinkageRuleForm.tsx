import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  createViolationRule,
  updateViolationRule,
  searchViolationProjectGroups,
  type ViolationRule,
} from "@/api/domains/studentViolation.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminFilePickButton } from "@/components/admin/AdminFilePickButton";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { isRichTextEmpty } from "@/utils/announcementHtml";

const STATUS_OPTIONS = [
  { value: "COHABITATION", label: "合笼/繁殖" },
  { value: "SPECIAL_FEEDING", label: "特殊饲养" },
  { value: "NEED_DIVIDE", label: "请分笼/密度超标" },
  { value: "HEALTH_ABNORMAL", label: "动物健康异常" },
  { value: "ANIMAL_TRANSFER", label: "动物转移" },
] as const;

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

const emptyRule = (): ViolationRule => ({
  ruleCode: "",
  ruleName: "",
  enabled: 1,
  sourceTag: "CAGE_STATUS",
  forbidEnter: 0,
  showNoticeEveryScan: 1,
  interactiveUnlockOnVerify: 1,
  unblockMethod: "自助解禁",
  unblockMaxCount: null,
  unblockWindowType: "滑动窗口",
  unblockWindowValue: 30,
  autoSignoutEnabled: 0,
  cageStatusCodes: [],
  cageDelayDays: 7,
  cageJudgeMode: "AUTO_SYNC_LINKED",
  cageManualTrigger: 0,
  cageTriggerAction: "BOTH",
});

interface Props {
  editing: ViolationRule | null;
  onClose: () => void;
}

export function CageLinkageRuleForm({ editing, onClose }: Props) {
  const queryClient = useQueryClient();
  const isNew = !editing?.id;
  const [form, setForm] = useState<ViolationRule>(editing ?? emptyRule());
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupSuggestions, setGroupSuggestions] = useState<string[]>([]);
  const groupSearchTimer = useRef<number | null>(null);

  useEffect(() => {
    setForm(editing ?? emptyRule());
  }, [editing]);

  const saveMu = useMutation({
    mutationFn: (body: ViolationRule) =>
      isNew ? createViolationRule(body) : updateViolationRule(editing!.id!, body),
    onSuccess: () => {
      toast.success(isNew ? "规则已创建" : "规则已更新");
      queryClient.invalidateQueries({ queryKey: ["violation-rules"] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e.message || "保存失败"),
  });

  const handleSave = async () => {
    if (!form.ruleName.trim()) {
      toast.error("请输入规则名称");
      return;
    }
    let urls: string[] = form.cageImageUrls ?? [];
    if (imageFiles.length > 0) {
      setUploading(true);
      const uploaded: string[] = [];
      for (const f of imageFiles) {
        try {
          const result = await uploadSingleImage(f);
          if (result?.publicUrl) uploaded.push(result.publicUrl);
        } catch {
          /* skip */
        }
      }
      urls = [...urls, ...uploaded];
      setUploading(false);
    }
    saveMu.mutate({ ...form, cageImageUrls: urls });
  };

  const toggleStatus = (code: string) => {
    const cur = form.cageStatusCodes ?? [];
    setForm({
      ...form,
      cageStatusCodes: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code],
    });
  };

  const handleSearchGroups = (kw: string) => {
    setGroupSearch(kw);
    if (!kw.trim()) {
      setGroupSuggestions([]);
      return;
    }
    if (groupSearchTimer.current) window.clearTimeout(groupSearchTimer.current);
    groupSearchTimer.current = window.setTimeout(async () => {
      try {
        const res = await searchViolationProjectGroups(kw, 10);
        setGroupSuggestions(res);
      } catch {
        setGroupSuggestions([]);
      }
    }, 250);
  };

  const addGroup = (g: string) => {
    const cur = form.cageGroupWhitelist ?? [];
    if (!cur.includes(g)) setForm({ ...form, cageGroupWhitelist: [...cur, g] });
    setGroupSearch("");
    setGroupSuggestions([]);
  };

  const removeGroup = (g: string) => {
    setForm({ ...form, cageGroupWhitelist: (form.cageGroupWhitelist ?? []).filter((x) => x !== g) });
  };

  const labelClass = "text-xs font-semibold text-[var(--app-color-text-secondary)]";
  const inputClass =
    "w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";
  const isAutoSync = (form.cageJudgeMode ?? "AUTO_SYNC_LINKED") === "AUTO_SYNC_LINKED";

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-[var(--app-elevation-modal)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between shrink-0 px-6 pt-6 pb-3 border-b border-[var(--app-color-border-default)]">
          <h3 className="text-lg font-bold text-[var(--app-color-text-primary)]">
            {isNew ? "新建笼架联动规则" : "编辑笼架联动规则"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)] transition-colors"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

        {/* ═══ 基本信息 ═══ */}
        <fieldset className="mb-5">
          <legend className="text-xs font-bold uppercase tracking-wider text-[var(--app-color-text-tertiary)] mb-3">
            基本信息
          </legend>
          <div className="space-y-3">
            <label className="block">
              <span className={labelClass}>规则名称</span>
              <input
                className={inputClass}
                value={form.ruleName}
                onChange={(e) => setForm({ ...form, ruleName: e.target.value })}
                placeholder="例如：健康异常笼架违规"
              />
            </label>

            {/* 监控状态类型 */}
            <div>
              <span className={labelClass}>监控状态类型</span>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {STATUS_OPTIONS.map((s) => {
                  const checked = (form.cageStatusCodes ?? []).includes(s.value);
                  return (
                    <label
                      key={s.value}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                        checked
                          ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]"
                          : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] text-[var(--app-color-text-secondary)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStatus(s.value)}
                        className="sr-only"
                      />
                      {s.label}
                    </label>
                  );
                })}
              </div>
              <p className="text-[10px] text-[var(--app-color-text-tertiary)] mt-1">
                至少选择一种状态类型；笼位出现这些状态且持续指定天数后将触发判定
              </p>
            </div>

            {/* 判定模式 + 延迟天数 */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClass}>判定模式</span>
                <select
                  className={inputClass}
                  value={form.cageJudgeMode ?? "AUTO_SYNC_LINKED"}
                  onChange={(e) =>
                    setForm({ ...form, cageJudgeMode: e.target.value as ViolationRule["cageJudgeMode"] })
                  }
                >
                  {JUDGE_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[var(--app-color-text-tertiary)] mt-0.5">
                  {form.cageJudgeMode === "AUTO_SYNC_LINKED"
                    ? "每次同步完成后复查状态"
                    : form.cageJudgeMode === "PURE_DAYS"
                      ? "到期后独立定时检查"
                      : "不自动触发，仅管理员手动操作"}
                </p>
              </label>
              <label className="block">
                <span className={labelClass}>延迟天数</span>
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  value={form.cageDelayDays ?? 7}
                  onChange={(e) =>
                    setForm({ ...form, cageDelayDays: parseInt(e.target.value) || 7 })
                  }
                />
                <p className="text-[10px] text-[var(--app-color-text-tertiary)] mt-0.5">
                  状态首次出现后等待此天数再判定
                </p>
              </label>
            </div>
          </div>
        </fieldset>

        {/* ═══ 联动设置 ═══ */}
        <fieldset className="mb-5">
          <legend className="text-xs font-bold uppercase tracking-wider text-[var(--app-color-text-tertiary)] mb-3">
            联动设置
          </legend>
          <div className="space-y-3">
            {/* 手动触发（仅 AUTO_SYNC_LINKED） */}
            {isAutoSync && (
              <div className="flex items-center gap-2 text-sm">
                <AdminSwitchScaled
                  size="sm"
                  checked={form.cageManualTrigger === 1}
                  onChange={(checked) =>
                    setForm({ ...form, cageManualTrigger: checked ? 1 : 0 })
                  }
                />
                <span className="text-[var(--app-color-text-primary)]">
                  手动执行定时任务也触发判定
                </span>
              </div>
            )}

            {/* 课题组白名单 */}
            <div>
              <span className={labelClass}>课题组白名单（空=全部课题组）</span>
              <div className="relative mt-1.5">
                <input
                  className={inputClass}
                  placeholder="搜索课题组名称…"
                  value={groupSearch}
                  onChange={(e) => handleSearchGroups(e.target.value)}
                />
                {groupSuggestions.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-lg">
                    {groupSuggestions.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className="block w-full text-left px-3 py-2 text-sm text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)] transition-colors"
                        onClick={() => addGroup(g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(form.cageGroupWhitelist ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(form.cageGroupWhitelist ?? []).map((g) => (
                    <span
                      key={g}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--app-color-accent)] bg-[var(--app-color-accent-soft)] px-2.5 py-0.5 text-xs text-[var(--app-color-accent)]"
                    >
                      {g}
                      <button
                        type="button"
                        onClick={() => removeGroup(g)}
                        className="ml-0.5 rounded-full p-0.5 text-[var(--app-color-accent)] hover:bg-[var(--app-color-accent)]/10"
                        aria-label={`移除 ${g}`}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 触发动作 */}
            <div>
              <span className={labelClass}>触发动作</span>
              <div className="mt-1.5 flex gap-4">
                {TRIGGER_ACTIONS.map((a) => (
                  <label
                    key={a.value}
                    className="flex cursor-pointer items-center gap-2 text-sm text-[var(--app-color-text-primary)]"
                  >
                    <input
                      type="radio"
                      name="triggerAction"
                      checked={form.cageTriggerAction === a.value}
                      onChange={() =>
                        setForm({ ...form, cageTriggerAction: a.value as ViolationRule["cageTriggerAction"] })
                      }
                    />
                    {a.label}
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-[var(--app-color-text-tertiary)] mt-1">
                触发后为每个课题组成员创建违规记录和/或扫码弹窗公告
              </p>
            </div>
          </div>
        </fieldset>

        {/* ═══ 违规内容 ═══ */}
        <fieldset className="mb-5">
          <legend className="text-xs font-bold uppercase tracking-wider text-[var(--app-color-text-tertiary)] mb-3">
            违规内容
          </legend>
          <div className="space-y-3">
            <div>
              <span className={labelClass}>
                违规文案模板（变量：{"${name} ${dept} ${status} ${cage} ${date}"}）
              </span>
              <div className="mt-1.5">
                <RichTextEditor
                  value={form.violationTextTpl ?? ""}
                  onChange={(v) => setForm({ ...form, violationTextTpl: v })}
                />
              </div>
            </div>

            {/* 图片上传 */}
            <div>
              <span className={labelClass}>违规图片</span>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <AdminFilePickButton
                  multiple
                  disabled={uploading}
                  onFiles={(files) => {
                    if (files?.length) setImageFiles(Array.from(files));
                  }}
                />
                {uploading && (
                  <span className="text-xs text-[var(--app-color-text-tertiary)]">上传中…</span>
                )}
              </div>
              {(form.cageImageUrls ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(form.cageImageUrls ?? []).map((url, i) => (
                    <div
                      key={i}
                      className="relative h-16 w-16 overflow-hidden rounded-md border border-[var(--app-color-border-default)]"
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-0 top-0 rounded-bl bg-red-500 px-1.5 py-0.5 text-xs text-white hover:bg-red-600"
                        onClick={() =>
                          setForm({
                            ...form,
                            cageImageUrls: (form.cageImageUrls ?? []).filter((_, j) => j !== i),
                          })
                        }
                        aria-label="移除图片"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {imageFiles.length > 0 && (
                <p className="mt-1 text-xs text-[var(--app-color-text-secondary)]">
                  已选择 {imageFiles.length} 个新文件，保存时上传
                </p>
              )}
            </div>
          </div>
        </fieldset>

        {/* ═══ 交互式确认 ═══ */}
        <fieldset className="mb-5">
          <legend className="text-xs font-bold uppercase tracking-wider text-[var(--app-color-text-tertiary)] mb-3">
            交互式确认
          </legend>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClass}>确认短语（留空=关闭交互确认）</span>
                <input
                  className={inputClass}
                  value={form.interactiveChallenge ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      interactiveChallenge: e.target.value || undefined,
                    })
                  }
                  placeholder="如：一人一卡,严禁尾随"
                />
              </label>
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-2 text-sm">
                  <AdminSwitchScaled
                    size="sm"
                    checked={form.interactiveUnlockOnVerify === 1}
                    onChange={(checked) =>
                      setForm({ ...form, interactiveUnlockOnVerify: checked ? 1 : 0 })
                    }
                  />
                  <span className="text-[var(--app-color-text-primary)]">验证后自动解除禁入</span>
                </div>
              </div>
            </div>
          </div>
        </fieldset>

        {/* ═══ 解禁管控 ═══ */}
        <fieldset className="mb-5">
          <legend className="text-xs font-bold uppercase tracking-wider text-[var(--app-color-text-tertiary)] mb-3">
            解禁管控
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
                  <option value="自助解禁">自助解禁（用户拼图验证）</option>
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

            {/* 计数窗口 */}
            <div>
              <span className={labelClass}>计数时间窗口</span>
              <div className="mt-1.5 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="windowType"
                    checked={form.unblockWindowType === "滑动窗口"}
                    onChange={() =>
                      setForm({
                        ...form,
                        unblockWindowType: "滑动窗口",
                        unblockWindowStart: undefined,
                        unblockWindowEnd: undefined,
                      })
                    }
                  />
                  滑动：最近
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
                      setForm({
                        ...form,
                        unblockWindowType: "固定周期",
                        unblockWindowValue: undefined,
                      })
                    }
                  />
                  固定：每年
                  <input
                    className="w-20 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-0.5 text-sm text-center font-mono"
                    placeholder="03-01"
                    maxLength={5}
                    value={form.unblockWindowStart || ""}
                    onChange={(e) => setForm({ ...form, unblockWindowStart: e.target.value })}
                    disabled={form.unblockWindowType !== "固定周期"}
                  />
                  至
                  <input
                    className="w-20 rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-2 py-0.5 text-sm text-center font-mono"
                    placeholder="07-01"
                    maxLength={5}
                    value={form.unblockWindowEnd || ""}
                    onChange={(e) => setForm({ ...form, unblockWindowEnd: e.target.value })}
                    disabled={form.unblockWindowType !== "固定周期"}
                  />
                </label>
              </div>
            </div>

            {form.unblockMaxCount != null && (
              <label className="block">
                <span className={labelClass}>达到上限时的替换公告（留空=沿用原违规文案）</span>
                <textarea
                  className={inputClass}
                  rows={3}
                  value={form.criticalNoticeText || ""}
                  onChange={(e) =>
                    setForm({ ...form, criticalNoticeText: e.target.value || undefined })
                  }
                  placeholder={`例如：${"${name}"}，你已累计违规 ${form.unblockMaxCount} 次，请立即联系管理员处理`}
                />
              </label>
            )}
          </div>
        </fieldset>

        {/* 启用 */}
        <div className="flex items-center gap-2 text-sm mb-5">
          <AdminSwitchScaled
            size="sm"
            checked={form.enabled === 1}
            onChange={(checked) => setForm({ ...form, enabled: checked ? 1 : 0 })}
          />
          <span className="text-[var(--app-color-text-primary)]">启用此规则</span>
        </div>
        </div>{/* End scrollable body */}

        {/* Sticky footer */}
        <div className="flex justify-end gap-3 shrink-0 px-6 py-4 border-t border-[var(--app-color-border-default)]">
          <AdminButton tone="secondary" onClick={onClose}>
            取消
          </AdminButton>
          <AdminButton
            tone="primary"
            onClick={handleSave}
            disabled={saveMu.isPending || uploading}
            loading={saveMu.isPending}
          >
            {saveMu.isPending ? "保存中..." : "保存规则"}
          </AdminButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
