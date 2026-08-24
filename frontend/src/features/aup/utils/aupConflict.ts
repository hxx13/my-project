import toast from "react-hot-toast";

/** 判定 AUP 并发/状态冲突（authHttp 将 HTTP 409 转为 Error，message 来自后端） */
export function isAupConflict(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /409|冲突|其他端|已被修改|乐观锁|状态已变更|当前阶段非|已投过票|请勿重复/i.test(m);
}

/** 冲突时刷新详情并提示用户重试；返回 true 表示已按冲突处理 */
export async function handleAupConflict(
  e: unknown,
  opts?: { refetch?: () => Promise<unknown>; message?: string },
): Promise<boolean> {
  if (!isAupConflict(e)) return false;
  try {
    await opts?.refetch?.();
  } catch {
    // refetch 失败不阻断提示
  }
  toast.error(opts?.message ?? "计划书状态已变更，已刷新数据，请重试");
  return true;
}
