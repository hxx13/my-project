/**
 * 复合题型模板库（参照真实 AUP 表单反抽的 13 种常见模式）。
 *
 * 每个模板 = 一组已配好字段键 / showWhen / 选项的普通 FormFieldDef，
 * 选中即「展开」插入到当前小节；插入后与手写字段完全一致，可自由编辑。
 *
 * 约定：
 * - build(base) 以给定前缀 base（已保证唯一）生成组内全部字段键，组内 showWhen 引用组内键。
 * - 选项改文字时，编辑器会自动把引用旧选项值的 showWhen 重写到新值（AupTemplateEditor 已有机制）。
 * - 板块级触发：用 sectionTrigger 建好触发题后，在选项「开启后显示」面板把目标板块/小节挂上去
 *   （模板本身只产出字段，不产出板块）。
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
        description: "选择「是」后显示下方补充说明",
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
    key: "multiDetail",
    label: "多选依据 + 必填说明",
    desc: "多选理由后，强制补一段说明",
    icon: "据",
    count: 2,
    build: (base) => [
      {
        fieldKey: `${base}.q`,
        label: "选择依据（可多选）",
        type: "choice",
        required: true,
        config: { choiceType: "multiple" } satisfies FieldConfig,
        options: ["依据一", "依据二", "依据三", "其他"],
      },
      {
        fieldKey: `${base}.detail`,
        label: "依据说明",
        type: "textarea",
        required: true,
        showWhen: sw(`${base}.q`, "notEmpty"),
        config: { maxLength: 5000 } satisfies FieldConfig,
        description: "请对以上所选依据进行说明（限5000字内）",
      },
    ],
  },
  {
    key: "multiCounts",
    label: "多选 + 逐项联动数量",
    desc: "勾选某类别后，弹出该类别的数量输入",
    icon: "量",
    count: 4,
    build: (base) => [
      {
        fieldKey: `${base}.q`,
        label: "选择类别（可多选）",
        type: "choice",
        required: true,
        config: { choiceType: "multiple" } satisfies FieldConfig,
        options: ["类别A", "类别B", "类别C"],
      },
      {
        fieldKey: `${base}.countA`,
        label: "类别A 数量",
        type: "number",
        showWhen: sw(`${base}.q`, "contains", "类别A"),
        config: { unit: "只" } satisfies FieldConfig,
      },
      {
        fieldKey: `${base}.countB`,
        label: "类别B 数量",
        type: "number",
        showWhen: sw(`${base}.q`, "contains", "类别B"),
        config: { unit: "只" } satisfies FieldConfig,
      },
      {
        fieldKey: `${base}.countC`,
        label: "类别C 数量",
        type: "number",
        showWhen: sw(`${base}.q`, "contains", "类别C"),
        config: { unit: "只" } satisfies FieldConfig,
      },
    ],
  },
  {
    key: "dropdownSelect",
    label: "下拉选择",
    desc: "单选下拉框（如动物品种、品系），选项自定义",
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
    key: "selectLinked",
    label: "下拉 + 关联输入",
    desc: "单选后，选中指定选项时显示关联输入框",
    icon: "关",
    count: 2,
    build: (base) => [
      {
        fieldKey: `${base}.q`,
        label: "选择…",
        type: "choice",
        required: true,
        config: { choiceType: "single" } satisfies FieldConfig,
        options: ["选项一", "选项二", "选项三"],
      },
      {
        fieldKey: `${base}.linked`,
        label: "关联填写内容",
        type: "text",
        showWhen: sw(`${base}.q`, "equals", "选项二"),
        description: "选中「选项二」时显示",
      },
    ],
  },
  {
    key: "multiChecklist",
    label: "多选确认清单",
    desc: "纯勾选承诺/声明，无联动",
    icon: "清",
    count: 1,
    build: (base) => [
      {
        fieldKey: `${base}.list`,
        label: "确认清单（可多选）",
        type: "choice",
        required: true,
        config: { choiceType: "multiple" } satisfies FieldConfig,
        options: ["声明/确认项一", "声明/确认项二", "声明/确认项三"],
      },
    ],
  },
  {
    key: "detailTable",
    label: "动态明细表",
    desc: "可增删行的表格，列为名称/类别/备注",
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
    key: "infoBlock",
    label: "说明块",
    desc: "一段静态富文本说明",
    icon: "说",
    count: 1,
    build: (base) => [
      {
        fieldKey: `${base}.note`,
        label: "说明",
        type: "description",
        description:
          "<p>在此填写说明文字，支持富文本 HTML：<b>加粗</b>、<i>斜体</i>、<ul><li>列表项一</li><li>列表项二</li></ul>。</p>",
      },
    ],
  },
  {
    key: "sectionTrigger",
    label: "板块触发题（A8 式）",
    desc: "多选补充表 G/H/I/J/K/L，K 固定勾选；选项「开启后显示」挂接目标板块",
    icon: "板",
    count: 1,
    build: (base) => [
      {
        fieldKey: `${base}.parts`,
        label: "包含在本申请中的其他补充部分（多选）",
        type: "choice",
        required: true,
        config: { choiceType: "multiple" } satisfies FieldConfig,
        description: "勾选后，对应的补充板块将自动展开显示",
        options: [
          { value: "G", label: "G：有害物质的使用信息。" },
          { value: "H", label: "H：动物的运输及流动信息。" },
          { value: "I", label: "I：动物保定、止痛及麻醉药物使用信息。" },
          { value: "J", label: "J：基因工程动物使用信息。" },
          { value: "K", label: "K：动物紧急状况处理说明。", fixed: true },
          { value: "L", label: "L：课题组管理区域饲养动物说明。" },
        ],
      },
    ],
  },
  {
    key: "notEqualsExpand",
    label: "反向联动（选否展开）",
    desc: "是/否单选，选「否」时才显示补充内容",
    icon: "反",
    count: 2,
    build: (base) => [
      {
        fieldKey: `${base}.q`,
        label: "是否…？",
        type: "choice",
        required: true,
        config: { choiceType: "single" } satisfies FieldConfig,
        options: ["是", "否"],
        description: "选择「否」后显示下方补充内容",
      },
      {
        fieldKey: `${base}.detail`,
        label: "补充内容",
        type: "textarea",
        showWhen: sw(`${base}.q`, "notEquals", "是"),
      },
    ],
  },
  {
    key: "declarationList",
    label: "声明清单 + 签名",
    desc: "长声明逐条确认后签名（F 式）",
    icon: "声",
    count: 2,
    build: (base) => [
      {
        fieldKey: `${base}.list`,
        label: "声明确认（多选）",
        type: "choice",
        required: true,
        config: { choiceType: "multiple" } satisfies FieldConfig,
        description: "请认真阅读以下每一项声明，确认后选择（多选）",
        options: [
          "我保证所填写的内容真实有效，没有故意隐瞒可能会对人员、动物造成伤害的风险操作。",
          "所有动物实验操作都将遵守我国实验动物相关法律法规及各项规章制度，以确保动物福利的实施。",
          "该研究是一个创新的项目，不是毫无意义的重复或对已报道过研究项目的重复。",
          "所有参与实验的人员都已经进行了职业风险和健康状况评估。",
          "本人授权本计划所列人员实施相关操作，监督其操作并承担相应责任。",
        ],
      },
      {
        fieldKey: `${base}.signature`,
        label: "负责人签名",
        type: "signature",
        required: true,
      },
    ],
  },
  {
    key: "tableLinked",
    label: "多选 + 联动明细表",
    desc: "勾选某类别后，展开一张可增删行的明细表",
    icon: "表",
    count: 2,
    build: (base) => [
      {
        fieldKey: `${base}.q`,
        label: "选择类别（可多选）",
        type: "choice",
        required: true,
        config: { choiceType: "multiple" } satisfies FieldConfig,
        options: ["类别一", "类别二", "类别三"],
      },
      {
        fieldKey: `${base}.table`,
        label: "明细表",
        type: "table",
        showWhen: sw(`${base}.q`, "contains", "类别二"),
        config: {
          columns: [
            { fieldKey: "col_name", label: "名称", type: "text" },
            { fieldKey: "col_kind", label: "类别", type: "choice", options: ["类别一", "类别二"] },
            { fieldKey: "col_note", label: "备注", type: "text" },
          ],
        } satisfies FieldConfig,
        description: "勾选「类别二」后显示",
      },
    ],
  },
  {
    key: "yesNoChecklistDetail",
    label: "是否 + 勾选清单 + 必填说明",
    desc: "选「是」后展开勾选清单与必填说明",
    icon: "勾",
    count: 3,
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
        fieldKey: `${base}.items`,
        label: "勾选清单（可多选）",
        type: "choice",
        showWhen: sw(`${base}.q`, "equals", "是"),
        config: { choiceType: "multiple" } satisfies FieldConfig,
        options: ["项一", "项二", "项三", "项四"],
      },
      {
        fieldKey: `${base}.detail`,
        label: "说明",
        type: "textarea",
        required: true,
        showWhen: sw(`${base}.q`, "equals", "是"),
        config: { maxLength: 5000 } satisfies FieldConfig,
      },
    ],
  },
  {
    key: "multiDetailEach",
    label: "多选 + 逐项条件说明",
    desc: "勾选的每个特定选项，各自展开对应说明框",
    icon: "逐",
    count: 3,
    build: (base) => [
      {
        fieldKey: `${base}.q`,
        label: "选择（可多选）",
        type: "choice",
        required: true,
        config: { choiceType: "multiple" } satisfies FieldConfig,
        options: ["选项一", "选项二", "其他"],
      },
      {
        fieldKey: `${base}.descA`,
        label: "选项一说明",
        type: "textarea",
        showWhen: sw(`${base}.q`, "contains", "选项一"),
        description: "勾选「选项一」后显示",
      },
      {
        fieldKey: `${base}.descOther`,
        label: "其他说明",
        type: "textarea",
        showWhen: sw(`${base}.q`, "contains", "其他"),
        description: "勾选「其他」后显示",
      },
    ],
  },
  {
    key: "toneNotes",
    label: "分级高亮说明块",
    desc: "信息(蓝)/警示(琥珀)/危险(红)三段说明",
    icon: "标",
    count: 3,
    build: (base) => [
      {
        fieldKey: `${base}.info`,
        label: "信息说明",
        type: "description",
        config: { tone: "info" } satisfies FieldConfig,
        description:
          "<p>一般信息说明：蓝底白边，用于表单操作提示、填写说明等。支持富文本 HTML。</p>",
      },
      {
        fieldKey: `${base}.warn`,
        label: "警示说明",
        type: "description",
        config: { tone: "warn" } satisfies FieldConfig,
        description:
          "<p><b>注意：</b>琥珀色警示块，用于「勾选出口需补填 H 表」「与 B6 数量相互印证」等提示。</p>",
      },
      {
        fieldKey: `${base}.danger`,
        label: "危险强调",
        type: "description",
        config: { tone: "danger" } satisfies FieldConfig,
        description:
          "<p><b>重要：</b>红色强调块，用于必须满足的硬性要求、禁止事项等醒目标注。</p>",
      },
    ],
  },
  {
    key: "gridChoice",
    label: "多列网格选择",
    desc: "选项按 N 列网格排布（2/3/4 列）",
    icon: "格",
    count: 1,
    build: (base) => [
      {
        fieldKey: `${base}.q`,
        label: "请选择（多选，多列排布）",
        type: "choice",
        required: true,
        config: { choiceType: "multiple", layout: "grid", cols: 3 } satisfies FieldConfig,
        options: ["选项一", "选项二", "选项三", "选项四", "选项五", "选项六"],
        description: "配置面板可调整列数；多列适合短选项的密排场景。",
      },
    ],
  },
  {
    key: "groupedChoice",
    label: "分组标题选择",
    desc: "选项按分组标题聚合（G1 式三组）",
    icon: "组",
    count: 1,
    build: (base) => [
      {
        fieldKey: `${base}.q`,
        label: "请选择（分组多选）",
        type: "choice",
        required: true,
        config: { choiceType: "multiple", layout: "grouped" } satisfies FieldConfig,
        description: "选项带「分组」属性时按组显示标题；可用于有害物质分类等分科场景。",
        options: [
          { value: "致癌物质/诱变剂", label: "致癌物质/诱变剂", group: "化合物/药物" },
          { value: "组织固定液（甲醛/福尔马林）", label: "组织固定液（甲醛/福尔马林）", group: "化合物/药物" },
          { value: "其他有害化合物", label: "其他有害化合物", group: "化合物/药物" },
          { value: "激光", label: "激光", group: "放射性物质" },
          { value: "辐照机/X射线机", label: "辐照机/X射线机", group: "放射性物质" },
          { value: "有活性病毒/细菌", label: "有活性病毒/细菌", group: "生物制品" },
          { value: "重组DNA", label: "重组DNA", group: "生物制品" },
        ],
      },
    ],
  },
  {
    key: "multiColumnGroup",
    label: "多列字段组",
    desc: "组内字段按 2/3/4 列网格排布",
    icon: "列",
    count: 1,
    build: (base) => [
      {
        fieldKey: `${base}.group`,
        label: "一行多字段（如 品种/品系/年龄/体重）",
        type: "group",
        config: { cols: 4 } satisfies FieldConfig,
        fields: [
          { fieldKey: "col_1", label: "字段一", type: "text" },
          { fieldKey: "col_2", label: "字段二", type: "text" },
          { fieldKey: "col_3", label: "字段三", type: "number", config: { unit: "g" } satisfies FieldConfig },
          { fieldKey: "col_4", label: "字段四", type: "text" },
        ],
      },
    ],
  },
  {
    key: "repeatBlock",
    label: "可重复块（每物种一块）",
    desc: "同构块可增删多份；块内联动只在本块内生效（B5/B6 式）",
    icon: "块",
    count: 1,
    build: (base) => [
      {
        fieldKey: `${base}.blocks`,
        label: "动物种类信息（可增加多项）",
        type: "repeatGroup",
        config: {
          cols: 2,
          fields: [
            {
              fieldKey: "species",
              label: "动物品种（品系）",
              type: "choice",
              required: true,
              config: { choiceType: "single" } satisfies FieldConfig,
              options: ["小鼠", "大鼠", "豚鼠", "兔", "犬", "猪", "其他"],
            },
            {
              fieldKey: "basis",
              label: "选用的理由",
              type: "choice",
              config: { choiceType: "multiple", layout: "grid", cols: 2 } satisfies FieldConfig,
              options: [
                "实验目的需要",
                "物种的自然生物学特性",
                "法规/标准指定",
                "动物易得、经济",
                "其他",
              ],
            },
            {
              fieldKey: "basisDesc",
              label: "其他理由说明",
              type: "textarea",
              showWhen: sw("basis", "notEmpty"),
              config: { maxLength: 5000 } satisfies FieldConfig,
            },
          ],
        } satisfies FieldConfig,
        description: "每种动物各填一块；「＋ 增加一项」添加新种类。块内勾选理由后显示说明框。",
      },
    ],
  },
];

/** 菜单角标文案（如「2 项」） */
export const templateCountText = (t: FieldTemplate) => `${t.count} 项`;
