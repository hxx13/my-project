/** 从人员档案 API 返回行中提取统一字段（兼容大小写/下划线） */
export type PersonnelRecordView = {
  userId: string;
  name: string;
  groupName: string;
  head?: string;
};

export function normalizePersonnelRecord(raw: Record<string, unknown>): PersonnelRecordView | null {
  if (!raw) return null;

  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const direct = raw[key];
      if (direct != null && String(direct).trim() && String(direct).toLowerCase() !== "null") {
        return String(direct).trim();
      }
    }
    const norm = Object.entries(raw).find(([k]) =>
      keys.some((t) => k.toLowerCase().replace(/_/g, "") === t.toLowerCase().replace(/_/g, ""))
    );
    if (norm?.[1] != null && String(norm[1]).trim() && String(norm[1]).toLowerCase() !== "null") {
      return String(norm[1]).trim();
    }
    return "";
  };

  const userId = pick("userid", "user_id", "id");
  const name = pick("name", "username");
  if (!userId && !name) return null;

  return {
    userId,
    name: name || "未知",
    groupName: pick("projectgroupname", "project_group_name", "groupname", "projectgroupnames") || "—",
    head: pick("head", "avatar") || undefined,
  };
}
