/**
 * AGV 活动分类器 — 可扩展的规则引擎
 *
 * 每个规则独立定义自己的匹配条件，按优先级排序后取最高匹配。
 * 后续如需细化条件（如增加 DI 通道检测、叉臂高度阈值、地图区域限定等），
 * 只需新增或修改规则条目，无需改动调用方。
 *
 * 使用方式：
 *   import { classifyActivity, DEFAULT_RULES } from "./agvActivityClassifier";
 *   const type = classifyActivity(status);                    // 默认规则
 *   const type = classifyActivity(status, customRules);       // 自定义规则集
 *   const type = classifyActivity(status, [...DEFAULT_RULES, myRule]); // 扩展
 */

export interface AgvStatusSnapshot {
  task_status: number | null;
  charging: boolean | null;
  fork_height: number | null;
  blocked?: boolean | null;
  emergency?: boolean | null;
  battery_level?: number | null;
  current_station?: string | null;
  current_map?: string | null;
  di_channels?: Array<{ id: number; status: boolean }> | null;
}

export interface ActivityRule {
  /** 规则名称（调试用） */
  name: string;
  /** 输出的活动类型 */
  activityType: string;
  /** 优先级，越大越优先 */
  priority: number;
  /** 匹配条件 — 返回 true 表示命中 */
  match: (s: AgvStatusSnapshot) => boolean;
  /** 可选：规则描述 */
  description?: string;
}

/**
 * 默认规则集（5 类活动）。
 *
 * 优先级设计：
 *   CHARGING(10) > TRANSPORT(8) > NAVIGATING(6) > STATION_WORK(5) > REST_STATION(4)
 *
 * 充电优先于运输（task_status=4 + charging 优先于 task_status=2）
 * 运输优先于寻路（有叉臂高度 > 无叉臂高度）
 * 载货优先于休息（有任务 + 叉臂动作 > 纯闲）
 */
export const DEFAULT_RULES: ActivityRule[] = [
  {
    name: "充电判断",
    activityType: "CHARGING",
    priority: 10,
    description: "task_status=4（空闲）且充电信号为 true",
    match: (s) => s.task_status === 4 && s.charging === true,
  },
  {
    name: "运输判断",
    activityType: "TRANSPORT",
    priority: 8,
    description: "task_status=2（执行任务）且叉臂高度 > 0.001m（载货移动）",
    match: (s) => s.task_status === 2 && (s.fork_height ?? 0) > 0.001,
  },
  {
    name: "寻路判断",
    activityType: "NAVIGATING",
    priority: 6,
    description: "task_status=2（执行任务）且叉臂未抬升（空载寻路）",
    match: (s) => s.task_status === 2,
  },
  {
    name: "作业判断",
    activityType: "STATION_WORK",
    priority: 5,
    description: "task_status=4（空闲）且叉臂高度 > 0.001m（正在操作货架）",
    match: (s) => s.task_status === 4 && (s.fork_height ?? 0) > 0.001,
  },
  {
    name: "休息判断",
    activityType: "REST_STATION",
    priority: 4,
    description: "task_status=4（空闲）且不在充电（等待/休息）",
    match: (s) => s.task_status === 4 && s.charging !== true,
  },
];

/**
 * 按优先级分类活动类型。
 * @param status AGV 当前状态快照
 * @param rules  规则集，默认 DEFAULT_RULES
 * @returns 匹配的活动类型，无匹配返回 undefined
 */
export function classifyActivity(
  status: AgvStatusSnapshot | null | undefined,
  rules: ActivityRule[] = DEFAULT_RULES,
): string | undefined {
  if (!status) return undefined;

  // 按优先级降序，首次命中即返回
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  for (const rule of sorted) {
    try {
      if (rule.match(status)) return rule.activityType;
    } catch {
      // 单条规则异常不影响其他规则
      continue;
    }
  }
  return undefined;
}

/**
 * 获取所有规则名称列表（调试/UI 展示用）
 */
export function getRuleNames(rules: ActivityRule[] = DEFAULT_RULES): string[] {
  return rules.map(r => r.name);
}

/**
 * 按活动类型获取对应的规则
 */
export function getRuleByType(
  activityType: string,
  rules: ActivityRule[] = DEFAULT_RULES,
): ActivityRule | undefined {
  return rules.find(r => r.activityType === activityType);
}
