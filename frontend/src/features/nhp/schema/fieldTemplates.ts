/**
 * NHP CRF 复合题型模板库。
 *
 * 每个模板 = 一组已配好字段键 / showWhen / 选项的普通 FormField，
 * 选中即「展开」插入到当前小节；插入后与手写字段完全一致，可自由编辑。
 *
 * NHP 专属模板对应业务流转（见 09）：供体-受体关联、随访序列、用药记录、灌注监测等；
 * 通用联动模板（是否+展开、下拉、明细表、可重复块、声明+签名）保留。
 */
import type { FormField, FieldConfig, ShowWhen } from "./formTemplate";

export interface FieldTemplate {
  key: string;
  label: string;
  desc: string;
  icon: string;
  /** 插入的字段个数（菜单角标） */
  count: number;
  build: (base: string) => FormField[];
}

const sw = (field: string, op: ShowWhen["op"], value?: string): ShowWhen =>
  value == null ? { field, op } : { field, op, value };

export const FIELD_TEMPLATES: FieldTemplate[] = [
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
  {
    key: "yesNoExpand",
    label: "是否 + 联动展开",
    desc: "是/否单选，选「是」后显示补充说明",
    icon: "联",
    count: 2,
    build: (base) => [
      {
        fieldKey: `${base}.q`,
        label: "是否…？",
        type: "choice",
        required: true,
        config: { choiceType: "single" } satisfies FieldConfig,
        options: ["是", "否"],
      },
      {
        fieldKey: `${base}.detail`,
        label: "补充说明",
        type: "textarea",
        showWhen: sw(`${base}.q`, "equals", "是"),
      },
    ],
  },
  {
    key: "dropdownSelect",
    label: "下拉选择",
    desc: "单选下拉框，选项自定义或引用码表",
    icon: "↓",
    count: 1,
    build: (base) => [
      {
        fieldKey: `${base}.q`,
        label: "请选择…",
        type: "select",
        required: true,
        options: ["选项一", "选项二", "选项三"],
      },
    ],
  },
  {
    key: "detailTable",
    label: "动态明细表",
    desc: "可增删行的表格",
    icon: "表",
    count: 1,
    build: (base) => [
      {
        fieldKey: `${base}.table`,
        label: "明细",
        type: "table",
        config: {
          columns: [
            { fieldKey: "col_name", label: "名称", type: "text" },
            { fieldKey: "col_kind", label: "类别", type: "choice", options: ["类别一", "类别二"] },
            { fieldKey: "col_note", label: "备注", type: "text" },
          ],
        } satisfies FieldConfig,
      },
    ],
  },
  {
    key: "declarationList",
    label: "声明清单 + 签名",
    desc: "声明逐条确认后签名",
    icon: "声",
    count: 2,
    build: (base) => [
      {
        fieldKey: `${base}.list`,
        label: "声明确认（多选）",
        type: "choice",
        required: true,
        config: { choiceType: "multiple" } satisfies FieldConfig,
        options: ["声明项一", "声明项二", "声明项三"],
      },
      {
        fieldKey: `${base}.signature`,
        label: "负责人签名",
        type: "signature",
        required: true,
      },
    ],
  },
];

/** 菜单角标文案（如「2 项」） */
export const templateCountText = (t: FieldTemplate) => `${t.count} 项`;
