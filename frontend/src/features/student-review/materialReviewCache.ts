import type { QueryClient } from "@tanstack/react-query";
import type { MaterialRequest } from "@/api/domains/material.api";
import { materialQueryKeys } from "@/api/hooks/queryKeys";

/** 与 MaterialReviewPage 已审结列表分页一致 */
export const MATERIAL_REVIEW_FINISHED_PAGE = { page: 1, size: 50 } as const;

function isMaterialPendingStatus(status?: string): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "PENDING" || s === "FIRST_OK";
}

function prependFinished(
  prev: { data: MaterialRequest[]; total: number } | undefined,
  row: MaterialRequest,
): { data: MaterialRequest[]; total: number } {
  const data = prev?.data ?? [];
  const without = data.filter((r) => r.id !== row.id);
  const had = data.length !== without.length;
  return {
    data: [row, ...without],
    total: Math.max(0, (prev?.total ?? data.length) + (had ? 0 : 1)),
  };
}

/** 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc */
export function mergeMaterialReviewAfterApprove(
  qc: QueryClient,
  updated: MaterialRequest,
  finishedParams: { page: number; size: number } = MATERIAL_REVIEW_FINISHED_PAGE,
): void {
  const stillPending = isMaterialPendingStatus(updated.status);

  qc.setQueryData<MaterialRequest[]>(materialQueryKeys.pendingRequests(), (prev) => {
    if (!prev) return prev;
    if (stillPending) {
      return prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r));
    }
    return prev.filter((r) => r.id !== updated.id);
  });

  if (!stillPending) {
    qc.setQueryData<{ data: MaterialRequest[]; total: number }>(
      materialQueryKeys.finishedRequests(finishedParams),
      (prev) => prependFinished(prev, updated),
    );
  }
}

/** 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc */
export function mergeMaterialReviewAfterReject(
  qc: QueryClient,
  id: string,
  finishedParams: { page: number; size: number } = MATERIAL_REVIEW_FINISHED_PAGE,
): void {
  let rejected: MaterialRequest | undefined;

  qc.setQueryData<MaterialRequest[]>(materialQueryKeys.pendingRequests(), (prev) => {
    if (!prev) return prev;
    rejected = prev.find((r) => r.id === id);
    return prev.filter((r) => r.id !== id);
  });

  if (rejected) {
    const row: MaterialRequest = { ...rejected, status: "REJECTED" };
    qc.setQueryData<{ data: MaterialRequest[]; total: number }>(
      materialQueryKeys.finishedRequests(finishedParams),
      (prev) => prependFinished(prev, row),
    );
  }
}

/** 撤销审核：从已审结缓存移除，回退到待审列表顶部 */
export function mergeMaterialReviewAfterRevoke(
  qc: QueryClient,
  id: string,
  finishedParams: { page: number; size: number } = MATERIAL_REVIEW_FINISHED_PAGE,
): void {
  let revoked: MaterialRequest | undefined;

  // 从已审结列表找到该条并移除
  qc.setQueryData<{ data: MaterialRequest[]; total: number }>(
    materialQueryKeys.finishedRequests(finishedParams),
    (prev) => {
      if (!prev) return prev;
      revoked = prev.data.find((r) => r.id === id);
      const data = prev.data.filter((r) => r.id !== id);
      const removed = data.length !== prev.data.length;
      return {
        data,
        total: removed ? Math.max(0, prev.total - 1) : prev.total,
      };
    },
  );

  // 回退到待审列表顶部
  if (revoked) {
    const row: MaterialRequest = { ...revoked, status: "PENDING" };
    qc.setQueryData<MaterialRequest[]>(materialQueryKeys.pendingRequests(), (prev) => {
      if (!prev) return [row];
      return [row, ...prev];
    });
  }
}

export function removeMaterialReviewRequestFromCaches(
  qc: QueryClient,
  id: string,
  finishedParams: { page: number; size: number } = MATERIAL_REVIEW_FINISHED_PAGE,
): void {
  qc.setQueryData<MaterialRequest[]>(materialQueryKeys.pendingRequests(), (prev) =>
    prev ? prev.filter((r) => r.id !== id) : prev,
  );
  qc.setQueryData<{ data: MaterialRequest[]; total: number }>(
    materialQueryKeys.finishedRequests(finishedParams),
    (prev) => {
      if (!prev) return prev;
      const data = prev.data.filter((r) => r.id !== id);
      const removed = data.length !== prev.data.length;
      return {
        data,
        total: removed ? Math.max(0, prev.total - 1) : prev.total,
      };
    },
  );
}
