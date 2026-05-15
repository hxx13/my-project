import { authHttp } from "@/api/core/authHttp";

export interface PurchaseOrderRecord {
  id: string;
  applicantId: string;
  applicantName?: string;
  location: string;
  content: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED";
  requestImages: string[];
  resultImages: string[];
  resultRemark?: string;
  processorId?: string;
  processorName?: string;
  isPublic?: number;
  createTime: string;
  startTime?: string;
  finishTime?: string;
}

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

interface PagedResult<T> {
  data: T[];
  total: number;
}

export async function createPurchaseOrder(payload: {
  location: string;
  content: string;
  requestImages: string[];
  isPublic: boolean;
}) {
  const res = await authHttp.post<Result<PurchaseOrderRecord>>("/purchase/orders", payload);
  return res.data.data;
}

export async function fetchPurchaseOrders(params: {
  page: number;
  size: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  includePrivate?: boolean;
  onlyMine?: boolean;
}) {
  const res = await authHttp.get<Result<PagedResult<PurchaseOrderRecord>>>("/purchase/orders", { params });
  return res.data.data;
}

export async function fetchPurchaseOrderDetail(id: string) {
  const res = await authHttp.get<Result<PurchaseOrderRecord>>(`/purchase/orders/${encodeURIComponent(id)}`);
  return res.data.data;
}

export async function startPurchaseOrder(id: string) {
  await authHttp.patch(`/purchase/orders/${id}/start`);
}

export async function completePurchaseOrder(id: string, payload: {
  resultRemark: string;
  resultImages: string[];
}) {
  await authHttp.patch(`/purchase/orders/${id}/complete`, payload);
}

export async function withdrawPurchaseOrder(id: string) {
  await authHttp.post(`/purchase/orders/${id}/withdraw`);
}

export async function deletePurchaseOrder(id: string) {
  await authHttp.delete(`/purchase/orders/${id}`);
}

export async function fetchPurchaseRecycle(params: { page: number; size: number }) {
  const res = await authHttp.get<Result<PagedResult<PurchaseOrderRecord>>>("/purchase/orders/recycle", { params });
  return res.data.data;
}

export async function purgePurchaseRecycleByIds(ids: string[]) {
  const res = await authHttp.post<Result<{ deleted: number }>>("/purchase/orders/recycle/purge", { ids });
  return res.data.data;
}

export async function purgeAllPurchaseRecycle() {
  const res = await authHttp.delete<Result<{ deleted: number }>>("/purchase/orders/recycle");
  return res.data.data;
}

export async function restorePurchaseRecycle(id: string) {
  await authHttp.post(`/purchase/orders/recycle/${id}/restore`);
}
