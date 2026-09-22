import { useEffect, useMemo, useState } from "react";
import {
  fetchCageTemplate,
  fetchCageInfoCodelist,
  type CageTemplateDetail,
  type CageTemplateField,
} from "../api/cageForm.api";
import { fetchCageOpFieldOptions } from "@/api/domains/cageShelf.api";
import { CAGE_FORM_KEY } from "../cageFormConstants";
import { flattenFields, optionsSourceOf, type FieldOption } from "./CageFieldEditor";

export type CodelistOptions = Record<string, FieldOption[]>;
export type FieldFlags = Record<string, { allowAddOption?: boolean; allowManualInput?: boolean }>;

/**
 * 表单渲染所需的「静态」资料：发布模板 + 各字段的码表 + 按笼位现算的候选与开关。
 *
 * <p>抽出来是为了让**单笼位填表**（CageFormFill）与**批量编辑**（CageBatchEditDialog）
 * 用的是同一份加载口径：两处各写一遍，候选来源 / 开关默认值迟早会漂。
 *
 * <p>{@code sampleCageId} 决定「按笼位现算」的那部分（如品系取该笼位 AUP 白名单）。
 * 批量编辑对多个笼位共用一份选项，只能拿其中一个笼位当样本 —— 见调用处说明。
 */
export function useCageFormAssets(sampleCageId: number | string | null) {
  const [template, setTemplate] = useState<CageTemplateDetail | null>(null);
  const [templateError, setTemplateError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [codelists, setCodelists] = useState<CodelistOptions>({});
  const [dynOptions, setDynOptions] = useState<CodelistOptions>({});
  const [dynFlags, setDynFlags] = useState<FieldFlags>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCageTemplate(CAGE_FORM_KEY)
      .then((t) => {
        if (!cancelled) {
          setTemplate(t);
          setTemplateError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setTemplate(null);
          setTemplateError(e);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fields = useMemo(() => (template ? flattenFields(template) : []), [template]);

  // 载入 dictKey 字段的码表选项
  useEffect(() => {
    if (!template) return;
    const keys = new Set<string>();
    for (const { field } of flattenFields(template)) if (field.dictKey) keys.add(field.dictKey);
    if (keys.size === 0) return;
    let cancelled = false;
    (async () => {
      const m: CodelistOptions = {};
      for (const k of Array.from(keys)) {
        try {
          const c = await fetchCageInfoCodelist(k);
          m[k] = (c.items ?? []).map((it) => ({ value: it.itemCode, label: it.itemLabel }));
        } catch {
          /* 码表缺失忽略 */
        }
      }
      if (!cancelled) setCodelists(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [template]);

  // 载入字段候选（按笼位现算）+ 配置开关。
  // combo 题型即使没有 optionsSource 也要拉 —— 它的候选可能来自字段自己的码表，
  // 而且「能否新增预设」这个开关只有后端知道。
  useEffect(() => {
    if (!template || sampleCageId == null) {
      setDynOptions({});
      setDynFlags({});
      return;
    }
    const targets = flattenFields(template)
      .map(({ field }) => field)
      .filter((f) => optionsSourceOf(f) != null || f.fieldType === "combo");
    if (targets.length === 0) {
      setDynOptions({});
      setDynFlags({});
      return;
    }
    let cancelled = false;
    (async () => {
      const m: CodelistOptions = {};
      const fl: FieldFlags = {};
      for (const f of targets) {
        try {
          const r = await fetchCageOpFieldOptions(sampleCageId, f.canonical);
          m[f.canonical] = r.options ?? [];
          fl[f.canonical] = { allowAddOption: r.allowAddOption, allowManualInput: r.allowManualInput };
        } catch {
          m[f.canonical] = [];
        }
      }
      if (!cancelled) {
        setDynOptions(m);
        setDynFlags(fl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [template, sampleCageId]);

  /** 字段选项：后端现算过就用它，否则退回静态码表（与 CageFormFill 同一口径）。 */
  const optionsFor = (field: CageTemplateField): FieldOption[] =>
    dynOptions[field.canonical] ?? (codelists[field.dictKey ?? ""] ?? []);

  return { template, templateError, loading, fields, optionsFor, dynFlags, setDynOptions, setDynFlags };
}
