/** 系统设置：枚举与键名 → 中文展示（避免运营手输英文代码） */

export const ROLE_LEVEL_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "学生" },
  { value: 2, label: "职工" },
  { value: 3, label: "高级职工" },
  { value: 4, label: "管理员" },
  { value: 5, label: "超级管理员" },
  { value: 6, label: "平台所有者" },
];

export const ENABLED_OPTIONS = [
  { value: "1", label: "启用" },
  { value: "0", label: "停用" },
] as const;

export const RECIPIENT_MODE_OPTIONS = [
  { value: "HYBRID", label: "混合策略（关联人 + 角色）" },
  { value: "RELATED", label: "仅通知关联人" },
  { value: "ROLE", label: "仅按角色广播" },
] as const;

export const APPLICANT_LIST_MODE_OPTIONS = [
  { value: "VISIBLE_POOL", label: "可见人员池（代他人提交时可选）" },
  { value: "ONLY_MINE", label: "仅本人（不可代选他人）" },
] as const;

const BIZ_TYPE_LABELS: Record<string, string> = {
  REPAIR: "报修",
  PURCHASE: "采购",
  SUPPLIES_CLAIM: "物资领用",
  SUPPLIES_ADMIN: "物资后台",
  notification: "通知",
  template: "通知模板",
  capability: "业务能力",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  CREATED: "创建",
  STARTED: "接单/开始",
  COMPLETED: "完成",
  WITHDRAWN: "撤回",
  DELETED: "删除",
  RESTORED: "恢复",
  UPDATED: "更新",
  ASSIGNED: "指派",
  REJECTED: "驳回",
};

const TEMPLATE_KEY_LABELS: Record<string, string> = {
  REPAIR_CREATED: "报修-新建",
  REPAIR_STARTED: "报修-接单",
  REPAIR_COMPLETED: "报修-完成",
  PURCHASE_CREATED: "采购-新建",
  PURCHASE_COMPLETED: "采购-完成",
  SUPPLIES_CLAIM_CREATED: "物资领用-下单",
  SUPPLIES_CLAIM_COMPLETED: "物资领用-完成",
  SUPPLIES_ADMIN_ALERT: "物资后台-提醒",
};

const CONFIG_OPTION_LABELS: Record<string, string> = {
  true: "是",
  false: "否",
  "1": "是",
  "0": "否",
  ON: "开启",
  OFF: "关闭",
  enabled: "启用",
  disabled: "停用",
};

export function labelBizType(code: string): string {
  return BIZ_TYPE_LABELS[code] || code;
}

export function labelEventType(code: string): string {
  return EVENT_TYPE_LABELS[code] || code;
}

export function labelTemplateKey(key: string): string {
  if (TEMPLATE_KEY_LABELS[key]) return TEMPLATE_KEY_LABELS[key];
  if (key.startsWith("REPAIR_")) return `报修-${labelEventType(key.replace("REPAIR_", ""))}`;
  if (key.startsWith("PURCHASE_")) return `采购-${labelEventType(key.replace("PURCHASE_", ""))}`;
  if (key.startsWith("SUPPLIES_")) return `物资-${key.replace("SUPPLIES_", "")}`;
  return key;
}

export function labelRecipientMode(mode: string): string {
  return RECIPIENT_MODE_OPTIONS.find((o) => o.value === mode)?.label || mode;
}

export function labelApplicantListMode(mode: string): string {
  return APPLICANT_LIST_MODE_OPTIONS.find((o) => o.value === mode)?.label || mode;
}

export function labelRoleLevel(level: number): string {
  return ROLE_LEVEL_OPTIONS.find((o) => o.value === level)?.label || `等级 ${level}`;
}

/** 配置下拉项：优先中文，否则原值 */
export function labelConfigOption(opt: string): string {
  const k = opt.trim();
  return CONFIG_OPTION_LABELS[k] ?? CONFIG_OPTION_LABELS[k.toUpperCase()] ?? k;
}

export type SettingsNavGroup = {
  id: string;
  title: string;
  items: Array<{ key: string; label: string }>;
};

/** 配置模块侧栏分组（固定顺序；未列入的模块归入「其他」） */
const MODULE_GROUP_DEFS: Array<{ id: string; title: string; keys: string[] }> = [
  { id: "notify", title: "通知与权限", keys: ["notification", "template", "capability"] },
  { id: "experience", title: "界面与展示", keys: ["dashboard_codex", "telemetry_facility", "frontend_runtime", "scanner"] },
  { id: "business", title: "业务扩展", keys: ["supplies", "mini_program", "llm"] },
  { id: "platform", title: "平台与网络", keys: ["network", "system"] },
];

export function groupSettingsModules(modules: Array<{ key: string; label: string }>): SettingsNavGroup[] {
  const byKey = new Map(modules.map((m) => [m.key, m]));
  const used = new Set<string>();
  const groups: SettingsNavGroup[] = [];

  for (const def of MODULE_GROUP_DEFS) {
    const items = def.keys.map((k) => byKey.get(k)).filter((m): m is { key: string; label: string } => Boolean(m));
    items.forEach((m) => used.add(m.key));
    if (items.length > 0) groups.push({ id: def.id, title: def.title, items });
  }

  const rest = modules.filter((m) => !used.has(m.key));
  if (rest.length > 0) groups.push({ id: "other", title: "其他", items: rest });

  return groups;
}

export function moduleLabel(modules: Array<{ key: string; label: string }>, moduleKey: string): string {
  return modules.find((m) => m.key === moduleKey)?.label || moduleKey;
}

export function moduleDescription(moduleKey: string): string {
  switch (moduleKey) {
    case "notification":
      return "配置各业务在何种事件下发送站内通知、通知谁、使用哪条模板。";
    case "template":
      return "编辑通知标题与正文模板；底部可配置物资领用额外推送接收人。";
    case "capability":
      return "按业务域设置提交/处理最低角色、待办可见范围等策略。";
    case "dashboard_codex":
      return "主页还卡说明、惩戒公告等面向用户的文案与样式。";
    case "telemetry_facility":
      return "动物房 B1F 等设施房间的 3D 布局规则（JSON，修改后通常即时生效）。";
    case "supplies":
      return "物资领用相关系统参数。";
    case "mini_program":
      return "微信小程序订阅消息等推送参数。";
    case "frontend_runtime":
      return "前端运行时开关与展示参数。";
    case "network":
      return "网络与接口相关参数。";
    case "system":
      return "通用系统级参数。";
    case "llm":
      return "通义/DashScope：主模型 + 备用列表自动切换；可开启日批与打开清算时自动生成 AI 解读。";
    default:
      return "按配置定义维护本模块参数，无需记忆英文键名。";
  }
}
