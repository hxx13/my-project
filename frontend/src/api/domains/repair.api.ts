import { authHttp } from "@/api/core/authHttp";

export interface RepairOrderRecord {
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

export async function createRepairOrder(payload: {
  location: string;
  content: string;
  requestImages: string[];
  isPublic: boolean;
}) {
  const res = await authHttp.post<Result<RepairOrderRecord>>("/repair/orders", payload);
  return res.data.data;
}

export async function fetchRepairOrders(params: {
  page: number;
  size: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  includePrivate?: boolean;
  onlyMine?: boolean;
}) {
  const res = await authHttp.get<Result<PagedResult<RepairOrderRecord>>>("/repair/orders", { params });
  return res.data.data;
}

export async function fetchRepairOrderDetail(id: string) {
  const res = await authHttp.get<Result<RepairOrderRecord>>(`/repair/orders/${id}`);
  return res.data.data;
}

export async function startRepairOrder(id: string) {
  await authHttp.patch(`/repair/orders/${id}/start`);
}

export async function completeRepairOrder(id: string, payload: {
  resultRemark: string;
  resultImages: string[];
}) {
  await authHttp.patch(`/repair/orders/${id}/complete`, payload);
}

export async function withdrawRepairOrder(id: string) {
  await authHttp.post(`/repair/orders/${id}/withdraw`);
}

export async function deleteRepairOrder(id: string) {
  await authHttp.delete(`/repair/orders/${id}`);
}

export async function fetchRepairRecycle(params: { page: number; size: number }) {
  const res = await authHttp.get<Result<PagedResult<RepairOrderRecord>>>("/repair/orders/recycle", { params });
  return res.data.data;
}

export async function purgeRepairRecycleByIds(ids: string[]) {
  const res = await authHttp.post<Result<{ deleted: number }>>("/repair/orders/recycle/purge", { ids });
  return res.data.data;
}

export async function purgeAllRepairRecycle() {
  const res = await authHttp.delete<Result<{ deleted: number }>>("/repair/orders/recycle");
  return res.data.data;
}

export async function restoreRepairRecycle(id: string) {
  await authHttp.post(`/repair/orders/recycle/${id}/restore`);
}
