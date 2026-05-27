/** 与 aro_personnel / getDebugPredictionUserPage 后端排序一致（主序由 API 保证） */
export const PERSONNEL_SORT_KEYS = [
  "has_official_room_permission DESC",
  "total_exp DESC",
  "name ASC",
] as const;
