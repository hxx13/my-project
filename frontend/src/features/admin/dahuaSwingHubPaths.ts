/** 已合并至「门禁数据工作台」/admin/dahua-swing-tasks 的旧独立路由 */
export const DAHUA_SWING_HUB_MERGED_PATHS = new Set([
  "/admin/dahua-swing-stats-tasks",
  "/admin/dahua-swing-stats-backfill",
  "/admin/dahua-swing-records",
  "/admin/access-audit-source",
  "/admin/access-fusion",
  "/admin/access-clean-rule-profiles",
]);

export function isDahuaSwingHubMergedPath(path: string): boolean {
  const norm = (path || "").replace(/[?#].*$/, "").replace(/\/+/g, "/");
  return DAHUA_SWING_HUB_MERGED_PATHS.has(norm);
}
