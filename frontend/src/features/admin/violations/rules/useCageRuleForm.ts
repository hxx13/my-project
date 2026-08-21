import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  listViolationRules,
  createViolationRule,
  updateViolationRule,
  deleteViolationRule,
  type ViolationRule,
} from "@/api/domains/studentViolation.api";
import { manualTriggerRule } from "@/api/domains/cageStatusViolation.api";
import { fetchSpecialStatusOverview, type SpecialStatusOverview } from "@/api/domains/cageShelf.api";
import { uploadSingleImage } from "@/api/domains/upload.api";

import { appConfirm } from "@/lib/appDialog";
/** 新建规则默认值。笼架联动字段一律初始化为 JS 数组/对象（后端 Entity 为 JSON 字符串，由 api 层负责序列化）。 */
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
  cageAreaFilter: { campuses: [], rooms: [] },
  cageGroupWhitelist: [],
  cageImageUrls: [],
});

/** 笼架 JSON 字符串字段 → JS 数组/对象。api 层已反序列化，此处兜底再解析一次，确保 UI 只见数组。 */
function parseStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseAreaFilter(raw: unknown): NonNullable<ViolationRule["cageAreaFilter"]> {
  let obj: unknown = raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = raw;
    }
  }
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const o = obj as { campuses?: unknown; rooms?: unknown };
    return { campuses: parseStringArray(o.campuses), rooms: parseStringArray(o.rooms) };
  }
  return { campuses: [], rooms: [] };
}

/** 把任意来源的规则归一为「笼架字段均为数组/对象」的表单态。 */
function normalizeForForm(rule: ViolationRule): ViolationRule {
  return {
    ...rule,
    cageStatusCodes: parseStringArray(rule.cageStatusCodes),
    cageGroupWhitelist: parseStringArray(rule.cageGroupWhitelist),
    cageImageUrls: parseStringArray(rule.cageImageUrls),
    cageAreaFilter: parseAreaFilter(rule.cageAreaFilter),
  };
}

export function useCageRuleForm() {
  const qc = useQueryClient();

  const [form, setFormState] = useState<ViolationRule>(emptyRule());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ["violation-rules"],
    queryFn: () => listViolationRules(),
  });

  const { data: specialStatus }: { data?: SpecialStatusOverview } = useQuery({
    queryKey: ["specialStatusOverview"],
    queryFn: () => fetchSpecialStatusOverview(),
    staleTime: 60_000,
  });

  const setForm = useCallback((patch: Partial<ViolationRule>) => {
    setFormState((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setFormState(emptyRule());
    setEditingId(null);
    setImageFiles([]);
  }, []);

  const loadForEdit = useCallback(
    (id: number) => {
      const rule = rules.find((r) => r.id === id);
      if (!rule) return;
      setFormState(normalizeForForm(rule));
      setEditingId(id);
      setImageFiles([]);
    },
    [rules]
  );

  const openStatusPicker = useCallback(() => setStatusPickerOpen(true), []);
  const closeStatusPicker = useCallback(() => setStatusPickerOpen(false), []);
  const confirmStatusPick = useCallback((codes: string[]) => {
    setFormState((prev) => ({ ...prev, cageStatusCodes: codes }));
    setStatusPickerOpen(false);
  }, []);

  const save = useCallback(async () => {
    if (!form.ruleName.trim()) {
      toast.error("请输入规则名称");
      return;
    }
    if ((form.cageStatusCodes ?? []).length === 0) {
      toast.error("请至少选择一种监控状态类型");
      return;
    }

    setSaving(true);
    try {
      let urls: string[] = form.cageImageUrls ?? [];
      if (imageFiles.length > 0) {
        setUploading(true);
        const uploaded: string[] = [];
        for (const f of imageFiles) {
          try {
            const result = await uploadSingleImage(f);
            if (result?.publicUrl) uploaded.push(result.publicUrl);
          } catch {
            /* 单张失败跳过 */
          }
        }
        urls = [...urls, ...uploaded];
      }

      const payload: ViolationRule = { ...form, cageImageUrls: urls };
      if (editingId) {
        await updateViolationRule(editingId, payload);
        toast.success("规则已更新");
      } else {
        await createViolationRule(payload);
        toast.success("规则已创建");
      }

      reset();
      qc.invalidateQueries({ queryKey: ["violation-rules"] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e.message || "保存失败");
    } finally {
      setUploading(false);
      setSaving(false);
    }
  }, [form, imageFiles, editingId, reset, qc]);

  const remove = useCallback(
    async (id: number) => {
      const rule = rules.find((r) => r.id === id);
      if (!await appConfirm(`确定删除规则「${rule?.ruleName ?? ""}」？`)) return;
      try {
        await deleteViolationRule(id);
        toast.success("规则已删除");
        if (editingId === id) reset();
        qc.invalidateQueries({ queryKey: ["violation-rules"] });
      } catch (e: any) {
        toast.error(e?.response?.data?.message || e.message || "删除失败");
      }
    },
    [rules, editingId, reset, qc]
  );

  const manualTrigger = useCallback(
    async (id: number) => {
      if (!await appConfirm("确定手动触发此规则的判定？")) return;
      try {
        await manualTriggerRule(id);
        toast.success("手动触发已提交");
        qc.invalidateQueries({ queryKey: ["cage-status-violations"] });
      } catch (e: any) {
        toast.error(e?.response?.data?.message || e.message || "触发失败");
      }
    },
    [qc]
  );

  return {
    form,
    setForm,
    editingId,
    loadForEdit,
    reset,
    statusPickerOpen,
    openStatusPicker,
    closeStatusPicker,
    confirmStatusPick,
    saving,
    save,
    remove,
    manualTrigger,
    rules,
    rulesLoading,
    specialStatus,
    imageFiles,
    setImageFiles,
    uploading,
  };
}
