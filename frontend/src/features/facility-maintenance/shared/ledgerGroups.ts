/** 台账分组 + 快捷项存储（耗材 / 更换两个页签共用）。 */

export interface LedgerGroup<T> {
  name: string;
  rows: T[];
  /** 组内最新一条（按时间倒序的第一条），用于「组内新增」继承上一次内容 */
  latest: T;
  count: number;
  rangeText: string;
}

/**
 * 按分类分组。rows 需已按时间倒序；分组顺序跟随分类首次出现的顺序，
 * 也就是「最近有过记录的分类排在前面」。
 */
export function groupByCategory<T>(
  rows: T[],
  categoryOf: (row: T) => string,
  dateTextOf: (row: T) => string,
): LedgerGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = categoryOf(row) || "未分类";
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  const groups: LedgerGroup<T>[] = [];
  map.forEach((list, name) => {
    const latestDate = dateTextOf(list[0]);
    const oldestDate = dateTextOf(list[list.length - 1]);
    groups.push({
      name,
      rows: list,
      latest: list[0],
      count: list.length,
      rangeText: oldestDate && oldestDate !== latestDate ? `${oldestDate} ~ ${latestDate}` : latestDate,
    });
  });
  return groups;
}

export interface QuickOption {
  id: string;
  label: string;
  /** 表单字段快照，点击后回填、由用户确认再提交 */
  data: Record<string, unknown>;
}

export function loadQuickOptions(key: string): QuickOption[] {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as QuickOption[]) : [];
  } catch {
    return [];
  }
}

export function saveQuickOptions(key: string, list: QuickOption[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // localStorage 不可用时快捷项只在本次会话有效，不影响台账本身
  }
}
