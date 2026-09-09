/**
 * 健康调查表题目数据 —— 从原 ARO 的 XFA 表单（健康调查表（系统版）.pdf）逐条还原。
 * 题干、选项、顺序与原表一致；排版样式可自由调整。
 */

export type SurveyField =
  | { kind: "checkboxes"; key: string; label: string; options: string[] }
  | { kind: "yesno"; key: string; label: string; detail?: string }
  | { kind: "radios"; key: string; label: string; options: string[] }
  | { kind: "text"; key: string; label: string; placeholder?: string }
  | { kind: "textarea"; key: string; label: string }
  | { kind: "grid"; key: string; label: string; rowHeader: string; columns: string[]; rows: string[] }
  | { kind: "list"; key: string; label: string; columns: string[] };

export interface SurveySection {
  title: string;
  fields: SurveyField[];
}

/** 页脚（原表每页重复的那行） */
export const SURVEY_FOOTER = "保密 - 不可复印，不可传真，不可传播，仅供上海交通大学医学院职业健康审核使用";

export const SURVEY_TITLE = {
  org: "上海交通大学医学院",
  name: "动物实验人员风险告知及健康调查信息表",
};

const ANIMALS = [
  "小鼠", "大鼠", "沙鼠", "树鼬", "仓鼠", "兔子", "狗", "猫", "牛", "山羊", "绵羊", "豚鼠", "鱼", "猪",
];

const ALLERGY_COLUMNS = ["皮疹", "哮喘", "瘙痒", "流眼泪"];

export const HEALTH_SURVEY: SurveySection[] = [
  {
    title: "卷首",
    fields: [
      {
        kind: "radios",
        key: "surveyType",
        label: "请勾选一项：",
        options: ["首次参加本调查", "定期/跟踪调查"],
      },
    ],
  },
  {
    title: "第一部分：个人信息",
    fields: [
      { kind: "text", key: "name", label: "姓名" },
      { kind: "text", key: "jobNumber", label: "工号 / 学号" },
      { kind: "text", key: "department", label: "部门 / 课题组" },
      { kind: "text", key: "contact", label: "联系电话" },
    ],
  },
  {
    title: "第二部分：健康调查",
    fields: [
      {
        kind: "checkboxes",
        key: "q1_history",
        label: "1. 病史（可多选）",
        options: [
          "无任何疾病史、手术史或住院史",
          "糖尿病", "高血压", "呼吸疾病", "动物过敏", "癌症", "癫痫",
          "过敏性鼻炎（流鼻涕、打喷嚏，等）", "异位性皮炎（过敏性皮肤疾病）",
          "哮喘", "植物过敏或其他东西过敏",
        ],
      },
      {
        kind: "checkboxes",
        key: "q1_surgery",
        label: "你以前有做过手术吗？（以下几项，可多选）",
        options: [
          "阑尾切除手术", "扁桃体切除手术", "心脏手术", "胆囊手术", "子宫切除手术", "脾切除手术",
        ],
      },
      { kind: "yesno", key: "q2_doctor", label: "2. 最近有没有因为何种疾病看过医生？", detail: "如果是，请详细说明" },
      { kind: "yesno", key: "q3_eye", label: "3. 你在做动物实验时眼部会否感到不适？", detail: "如果是，请详细说明" },
      { kind: "yesno", key: "q4_immunity", label: "4. 你最近有没有生病导致免疫力下降，使得你在需要接触到动物的实验中更易感染？", detail: "如果是，请详细说明" },
      { kind: "yesno", key: "q5_medicine", label: "5. 你有没有在服用任何药物，例如会影响免疫功能的化疗药物？" },
      { kind: "yesno", key: "q6_env_allergy", label: "6. 你有没有任何环境性过敏情况，例如食物、植物或动物？" },
      { kind: "yesno", key: "q7_drug_allergy", label: "7. 你对任何药物过敏吗？" },
      { kind: "yesno", key: "q8_antihistamine", label: "8. 你需要药物控制流鼻涕、打喷嚏、眼部瘙痒或哮喘等过敏症状吗？" },
      {
        kind: "checkboxes",
        key: "q9_pets",
        label: "9. 你家养宠物吗？如果是，请说明是何种动物（可多选）",
        options: ["小鼠", "马", "大鼠", "羊", "沙鼠", "豚鼠", "仓鼠", "灵长类", "兔子", "鱼", "狗", "猪", "猫", "牛"],
      },
      {
        kind: "grid",
        key: "q10_animal_allergy",
        label: "10. 你对任何动物皮屑或蛋白过敏吗？（勾选对应动物与反应）",
        rowHeader: "动物品种",
        columns: ALLERGY_COLUMNS,
        rows: ["小鼠", "大鼠", "沙鼠", "树鼬", "仓鼠", "兔子", "狗", "猫", "牛", "山羊", "绵羊", "豚鼠", "鱼", "猪"],
      },
      { kind: "text", key: "q10_note", label: "如果是，请说明类型", placeholder: "补充说明" },
      { kind: "list", key: "q11_medications", label: "11. 请填写你正在服用的所有药物", columns: ["药物名称", "剂量", "服用频率", "备注"] },
      { kind: "yesno", key: "q12_protection", label: "12. 如果你参与到与动物有关的工作，需要特殊的防护措施吗（口罩、通风设备、手术帽）？" },
      {
        kind: "checkboxes",
        key: "q13_smoking",
        label: "13. 你过去或现在吸烟吗？如果是，请列举（可多选）",
        options: ["香烟", "烟斗", "烟草咀嚼物", "以前吸烟"],
      },
      { kind: "yesno", key: "q14_health_doctor", label: "14. 你因为何种健康问题去看医生吗？", detail: "如果是，请说明" },
      { kind: "yesno", key: "q15_new_problem", label: "15. 过去几年，你有没有发现任何新的健康问题？", detail: "如果是，请说明" },
      { kind: "yesno", key: "q16_wild", label: "16. 你有没有使用或收集野生哺乳动物（例如：野外活动）？" },
      {
        kind: "radios",
        key: "q17_tetanus",
        label: "17. 你上一次注射破伤风疫苗是什么时候？",
        options: ["10 年内", "10 年前"],
      },
      { kind: "yesno", key: "q18_new_allergy", label: "18. 你认为你有没有因研究工作开始对某种动物过敏？", detail: "如果是，请说明你对何种动物开始过敏，以及具体过敏反应" },
      {
        kind: "grid",
        key: "q19_contact_hours",
        label: "19. 勾选你目前接触到的动物品种以及接触时间：",
        rowHeader: "动物品种",
        columns: ["小于 5 小时", "5 到 20 小时", "大于 20 小时"],
        rows: ANIMALS,
      },
      { kind: "yesno", key: "q20_pregnant_sheep", label: "20. 你的研究工作涉及怀孕的山羊或绵羊吗？" },
      { kind: "yesno", key: "q21_solvent", label: "21. 在动物实验中，你有没有使用有机溶剂，例如：苯、三氯甲烷、甲苯、二氯甲烷、福尔马林等？" },
      { kind: "yesno", key: "q22_mask", label: "22. 在动物实验中，你有没有经常使用防尘口罩或者防毒面具？" },
      { kind: "yesno", key: "q23_anesthetic", label: "23. 在动物实验中，你有没有使用到麻醉气体，例如：氟烷气体、异氟烷、笑气、乙醚等？" },
      {
        kind: "checkboxes",
        key: "q24_bio",
        label: "24. 请你列举你在动物实验中会使用到的生物制品（详细到种、系，可多选）",
        options: ["病毒", "真菌", "细菌", "原生动物", "其他"],
      },
      { kind: "yesno", key: "q25_human_tissue", label: "25. 你在动物实验中会使用到人的组织或体液吗？" },
    ],
  },
  {
    title: "第三部分：意见与声明",
    fields: [
      { kind: "textarea", key: "suggestion", label: "意见或建议（楼层组长讨论，选择最合适的答案，并且考虑在近期一些情况会不会有所改变）" },
      { kind: "text", key: "signature", label: "本人签名" },
      { kind: "text", key: "signDate", label: "日期", placeholder: "YYYY-MM-DD" },
    ],
  },
];

export const SURVEY_DECLARATION = "我的认知范围内，尽我所能回答了以上问题。";

/** 扁平字段清单，便于校验与统计 */
export const SURVEY_FIELDS: SurveyField[] = HEALTH_SURVEY.flatMap((s) => s.fields);
