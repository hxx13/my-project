/**
 * 培训报名状态口径（学生端唯一来源）：
 * 审批 testYn 与 评分 testFraction 都为 1 才算「已通过」；任一为 2 即「已拒绝」；
 * 任一为 0 视为仍在流程中。与后台「待办 = testYn===0 || testFraction===0」同口径。
 */
export type EnrollStatus = "未报名" | "待审核" | "已通过" | "已拒绝";

export function enrollStatus(
  enrolled: boolean,
  testYn?: number | null,
  testFraction?: number | null,
): EnrollStatus {
  if (!enrolled) return "未报名";
  if (isFullyPassed(testYn, testFraction)) return "已通过";
  if (testYn === 2 || testFraction === 2) return "已拒绝";
  return "待审核";
}

/** 双通过才锁定报名（与后端 cancelEnrollment 的拦截条件同口径）。 */
export function isFullyPassed(testYn?: number | null, testFraction?: number | null): boolean {
  return testYn === 1 && testFraction === 1;
}

/** 已被驳回（审批拒绝或评分不合格）——学生可取消后重新报名。 */
export function isRejected(testYn?: number | null, testFraction?: number | null): boolean {
  return testYn === 2 || testFraction === 2;
}
