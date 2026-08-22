/**
 * NHP CRF 复合题型模板库。
 *
 * 每个模板 = 一组已配好字段键 / showWhen / 选项的普通 FormField，
 * 选中即「展开」插入到当前小节；插入后与手写字段完全一致，可自由编辑。
 *
 * NHP 专属模板对应业务流转（见 09）：供体-受体关联、随访序列、用药记录、灌注监测等；
 * 通用联动模板与 AUP 编辑器对齐（是否+展开、下拉、明细表、可重复块、声明+签名等）。
 */
import { FIELD_TEMPLATES as AUP_FIELD_TEMPLATES } from "@/features/aup/schema/fieldTemplates";
import type { FormField, FieldConfig } from "./formTemplate";

export interface FieldTemplate {
  key: string;
  label: string;
  desc: string;
  icon: string;
  /** 插入的字段个数（菜单角标） */
  count: number;
  build: (base: string) => FormField[];
}

/** NHP 业务专属复合模板（AUP 无对应项） */
const NHP_SPECIFIC_TEMPLATES: FieldTemplate[] = [
  {
    key: "donorRecipient",
    label: "供体-受体关联",
    desc: "供体猪 + 受体猴 两个关联下拉（外键）",
    icon: "链",
    count: 2,
    build: (base) => [
      {
        fieldKey: `${base}.donor`,
        label: "供体猪",
        type: "select",
        required: true,
        description: "关联 D1 供体猪域（DON-XXX）",
      },
      {
        fieldKey: `${base}.recip`,
        label: "受体猴",
        type: "select",
        required: true,
        description: "关联 D2 受体 NHP 域（RCP-XXX）",
      },
    ],
  },
  {
    key: "followUpSeq",
    label: "随访序列",
    desc: "可重复随访块：时点 + 生命体征 + 血肌酐 + CRP",
    icon: "随",
    count: 1,
    build: (base) => [
      {
        fieldKey: `${base}.visits`,
        label: "随访记录（可增加多项）",
        type: "repeatGroup",
        config: {
          fields: [
            { fieldKey: "tp", label: "时点", type: "select", required: true, options: ["TP04", "TP05", "TP06", "TP07", "TP08", "TP09"] },
            { fieldKey: "vitals", label: "生命体征", type: "text" },
            { fieldKey: "creatinine", label: "血肌酐", type: "number", config: { unit: "μmol/L" } },
            { fieldKey: "crp", label: "C反应蛋白", type: "number", config: { unit: "mg/L" } },
          ],
        } satisfies FieldConfig,
      },
    ],
  },
  {
    key: "medicationRecord",
    label: "用药记录",
    desc: "可重复用药块：药物 + 剂量 + 途径 + 给药时间",
    icon: "药",
    count: 1,
    build: (base) => [
      {
        fieldKey: `${base}.meds`,
        label: "免疫抑制用药（每次给药一条）",
        type: "repeatGroup",
        config: {
          fields: [
            { fieldKey: "drug", label: "药物", type: "select", required: true, options: ["他克莫司", "ATG", "吗替麦考酚酯", "泼尼松"] },
            { fieldKey: "dose", label: "剂量", type: "number", required: true, config: { unit: "mg/kg" } },
            { fieldKey: "route", label: "给药途径", type: "select", options: ["iv", "po", "im", "sc"] },
            { fieldKey: "time", label: "给药时间", type: "time" },
          ],
        } satisfies FieldConfig,
      },
    ],
  },
  {
    key: "perfusionMonitor",
    label: "灌注监测",
    desc: "可重复灌注块：时间 + 流量 + 压力（每3h序列）",
    icon: "灌",
    count: 1,
    build: (base) => [
      {
        fieldKey: `${base}.perfs`,
        label: "灌注参数（每 3h 一条）",
        type: "repeatGroup",
        config: {
          fields: [
            { fieldKey: "time", label: "参数记录时间", type: "time", required: true },
            { fieldKey: "flow", label: "灌注流量", type: "number", config: { unit: "mL/min" } },
            { fieldKey: "pressure", label: "灌注压力", type: "number", config: { unit: "mmHg" } },
          ],
        } satisfies FieldConfig,
      },
    ],
  },
];

const nhpKeys = new Set(NHP_SPECIFIC_TEMPLATES.map((t) => t.key));

/** AUP 通用复合模板（排除与 NHP 专属重复的 key） */
const SHARED_GENERIC_TEMPLATES = AUP_FIELD_TEMPLATES.filter((t) => !nhpKeys.has(t.key)) as FieldTemplate[];

/**
 * 菜单展示顺序：NHP 业务模板在前，其后为与 AUP 对齐的通用复合模板。
 */
export const FIELD_TEMPLATES: FieldTemplate[] = [...NHP_SPECIFIC_TEMPLATES, ...SHARED_GENERIC_TEMPLATES];

/** 菜单角标文案（如「2 项」） */
export const templateCountText = (t: FieldTemplate) => `${t.count} 项`;
