import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

// ---- types ----

export interface MaterialCategory {
  id: number;
  name: string;
  sortOrder: number;
  status: number;
}

export interface MaterialItem {
  id: number;
  categoryId: number;
  name: string;
  subtitle?: string;
  coverUrl?: string;
  shelfStatus: string;
  stockMode: string;
  stockQty: number;
  lockedQty?: number;
  showStockQty?: number;
  workflowType: string;
  reviewerIds?: string;
  secondReviewerIds?: string;
  isNewItem?: boolean;
  createdAt?: string;
  lastInboundAt?: string;
}

export interface MaterialRequestLine {
  id: number;
  itemId: number;
  qty: number;
  snapshotName: string;
  fulfilledQty: number;
}

export interface MaterialRequest {
  id: string;
  userId: string;
  applicantName?: string;
  applicantGroup?: string;
  status: string;
  workflowType: string;
  firstReviewerId?: string;
  firstReviewTime?: string;
  secondReviewerId?: string;
  secondReviewTime?: string;
  fulfilledAt?: string;
  fulfilledBy?: string;
  receivedAt?: string;
  createdAt: string;
  lines?: MaterialRequestLine[];
}

export interface MaterialAuditTrailRow {
  requestId: string;
  userId: string;
  applicantName?: string;
  applicantGroup?: string;
  status: string;
  itemName?: string;
  qty: number;
  fulfilledQty: number;
  createdAt?: string;
  fulfilledAt?: string;
  fulfilledBy?: string;
  firstReviewerId?: string;
  secondReviewerId?: string;
  firstReviewTime?: string;
  secondReviewTime?: string;
}

export interface MaterialStatsOverview {
  totalRequests: number;
  totalFulfilledQty: number;
  byStudent: Array<Record<string, unknown>>;
  byItem: Array<Record<string, unknown>>;
}

// ---- student API ----

export async function fetchMaterialCategories() {
  const res = await authHttp.get<Result<MaterialCategory[]>>("/material/categories");
  return res.data.data;
}

export async function fetchMaterialItems(categoryId?: number) {
  const res = await authHttp.get<Result<MaterialItem[]>>("/material/items", {
    params: categoryId != null ? { categoryId } : {},
  });
  return res.data.data;
}

export async function fetchMaterialItem(id: number) {
  const res = await authHttp.get<Result<MaterialItem>>(`/material/items/${id}`);
  return res.data.data;
}

export async function fetchMaterialCart(): Promise<Record<number, number>> {
  const res = await authHttp.get<Result<{ lines?: Record<string, number> }>>("/material/cart");
  const lines = res.data.data?.lines ?? {};
  const cart: Record<number, number> = {};
  for (const [k, v] of Object.entries(lines)) {
    const id = Number(k);
    const qty = Number(v);
    if (Number.isFinite(id) && id > 0 && Number.isFinite(qty) && qty > 0) {
      cart[id] = Math.min(Math.floor(qty), 999);
    }
  }
  return cart;
}

export async function saveMaterialCart(cart: Record<number, number>): Promise<void> {
  const lines: Record<string, number> = {};
  for (const [k, v] of Object.entries(cart)) {
    const id = Number(k);
    const qty = Number(v);
    if (Number.isFinite(id) && id > 0 && Number.isFinite(qty) && qty > 0) {
      lines[String(id)] = Math.min(Math.floor(qty), 999);
    }
  }
  await authHttp.put("/material/cart", { lines });
}

export async function createMaterialRequest(lines: { itemId: number; qty: number }[], applicantGroup?: string) {
  const res = await authHttp.post<Result<MaterialRequest>>("/material/requests", { lines, applicantGroup });
  return res.data.data;
}

export async function fetchMyMaterialRequests(params: { page: number; size: number; status?: string }) {
  const res = await authHttp.get<Result<{ data: MaterialRequest[]; total: number }>>("/material/requests/mine", { params });
  return res.data.data;
}

export async function fetchMaterialRequestDetail(id: string) {
  const res = await authHttp.get<Result<MaterialRequest>>(`/material/requests/${id}`);
  return res.data.data;
}

export async function withdrawMaterialRequest(id: string) {
  await authHttp.post(`/material/requests/${id}/withdraw`);
}

export async function confirmMaterialReceive(id: string) {
  await authHttp.post(`/material/requests/${id}/receive`);
}

export async function fetchMyMaterialStats() {
  const res = await authHttp.get<Result<MaterialStatsOverview>>("/material/stats/mine");
  return res.data.data;
}

// ---- admin API ----

export async function fetchAdminMaterialCategories() {
  const res = await authHttp.get<Result<MaterialCategory[]>>("/material/admin/categories");
  return res.data.data;
}

export async function createAdminMaterialCategory(body: { name: string; sortOrder?: number }) {
  const res = await authHttp.post<Result<MaterialCategory>>("/material/admin/categories", body);
  return res.data.data;
}

export async function updateAdminMaterialCategory(id: number, body: Partial<{ name: string; sortOrder: number; status: number }>) {
  const res = await authHttp.patch<Result<MaterialCategory>>(`/material/admin/categories/${id}`, body);
  return res.data.data;
}

export async function deleteAdminMaterialCategory(id: number) {
  await authHttp.delete(`/material/admin/categories/${id}`);
}

export async function fetchAdminMaterialItems(categoryId?: number) {
  const res = await authHttp.get<Result<MaterialItem[]>>("/material/admin/items", {
    params: categoryId != null ? { categoryId } : {},
  });
  return res.data.data;
}

export async function createAdminMaterialItem(body: Partial<MaterialItem> & { categoryId: number; name: string }) {
  const res = await authHttp.post<Result<MaterialItem>>("/material/admin/items", body);
  return res.data.data;
}

export async function updateAdminMaterialItem(id: number, body: Partial<MaterialItem>) {
  const res = await authHttp.patch<Result<MaterialItem>>(`/material/admin/items/${id}`, body);
  return res.data.data;
}

export async function deleteAdminMaterialItem(id: number) {
  await authHttp.delete(`/material/admin/items/${id}`);
}

export async function fetchAdminMaterialRecycle(params: { page: number; size: number }) {
  const res = await authHttp.get<Result<{ data: MaterialItem[]; total: number }>>("/material/admin/items/recycle", { params });
  return res.data.data;
}

export async function restoreAdminMaterialRecycle(id: number) {
  await authHttp.post(`/material/admin/items/recycle/${id}/restore`);
}

export async function purgeAdminMaterialRecycle(id: number) {
  await authHttp.delete(`/material/admin/items/recycle/${id}`);
}

export async function purgeAdminMaterialRecycleByIds(ids: number[]) {
  await authHttp.post("/material/admin/items/recycle/purge", { ids });
}

export async function purgeAllAdminMaterialRecycle() {
  await authHttp.delete("/material/admin/items/recycle");
}

export async function adjustMaterialStock(id: number, newQty: number) {
  await authHttp.patch(`/material/admin/items/${id}/stock`, { newQty });
}

export async function inboundMaterialItem(body: { itemId: number; qty: number }) {
  await authHttp.post("/material/admin/inbound", body);
}

export async function fetchPendingMaterialRequests() {
  const res = await authHttp.get<Result<MaterialRequest[]>>("/material/admin/requests/pending");
  return res.data.data;
}

export async function fetchAllMaterialRequests(params: { page: number; size: number; status?: string }) {
  const res = await authHttp.get<Result<{ data: MaterialRequest[]; total: number }>>("/material/admin/requests/all", { params });
  return res.data.data;
}

export async function approveMaterialRequest(id: string) {
  const res = await authHttp.post<Result<MaterialRequest>>(`/material/admin/requests/${id}/approve`);
  return res.data.data;
}

export async function rejectMaterialRequest(id: string) {
  await authHttp.post(`/material/admin/requests/${id}/reject`);
}

export async function fulfillMaterialRequest(id: string, lines: { lineId: number; grant: boolean; fulfillQty?: number }[]) {
  const res = await authHttp.post<Result<MaterialRequest>>(`/material/admin/requests/${id}/fulfill`, { lines });
  return res.data.data;
}

export async function fetchMaterialStatsOverview(from?: string, to?: string) {
  const res = await authHttp.get<Result<MaterialStatsOverview>>("/material/admin/stats/overview", {
    params: { from: from ?? "2000-01-01", to: to ?? "2099-12-31" },
  });
  return res.data.data;
}

export async function fetchMaterialAuditTrail(params: {
  from?: string; to?: string; categoryId?: number; groupId?: string; page: number; size: number;
}) {
  const res = await authHttp.get<Result<{ data: MaterialAuditTrailRow[]; total: number }>>("/material/admin/stats/audit", { params });
  return res.data.data;
}

export async function exportMaterialAuditTrail(params: {
  from?: string; to?: string; categoryId?: number; groupId?: string;
}): Promise<Blob> {
  const res = await authHttp.get("/material/admin/stats/export", {
    params,
    responseType: "blob",
  });
  return res.data as Blob;
}

// ---- demand API ----

export interface MaterialDemand {
  id: number;
  userId: string;
  suggestion: string;
  status: number;
  createdAt: string;
}

export async function createMaterialDemand(suggestion: string) {
  await authHttp.post("/material/demands", { suggestion });
}

export async function fetchMyMaterialDemands() {
  const res = await authHttp.get<Result<MaterialDemand[]>>("/material/demands/mine");
  return res.data.data;
}

export async function fetchAllMaterialDemands(params: { page: number; size: number }) {
  const res = await authHttp.get<Result<{ data: MaterialDemand[]; total: number }>>("/material/admin/demands", { params });
  return res.data.data;
}

export async function resolveMaterialDemand(id: number) {
  await authHttp.patch(`/material/admin/demands/${id}`, { status: 1 });
}
