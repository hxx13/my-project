import axios from "axios";
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
  specSchema?: string;   // JSON: {"dimensions":[{"name":"尺码","options":["S","M","L"]}]}
  specRequired?: number; // 0=可选 1=必选
}

export interface MaterialRequestLine {
  id: number;
  itemId: number;
  qty: number;
  snapshotName: string;
  fulfilledQty: number;
  specSnapshot?: string; // JSON: {"尺码":"S","颜色":"红"}
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

export interface MaterialStockMovementRow {
  id: number;
  itemId: number;
  itemName?: string;
  movementType: string;
  qty: number;
  stockAfter?: number;
  requestId?: string;
  operatorUserId?: string;
  applicantUserId?: string;
  applicantName?: string;
  applicantGroup?: string;
  remark?: string;
  createdAt?: string;
}

export async function fetchItemStockMovements(itemId: number, params: { page: number; size: number; applicantGroup?: string }) {
  const res = await authHttp.get<Result<{ data: MaterialStockMovementRow[]; total: number }>>(`/material/admin/audit/item/${itemId}/movements`, { params });
  return res.data.data;
}

export interface MaterialItemClaimRow {
  requestId: string;
  userId?: string;
  applicantName?: string;
  applicantGroup?: string;
  status: string;
  itemName?: string;
  qty: number;
  fulfilledQty?: number;
  createdAt?: string;
  fulfilledAt?: string;
}

export async function fetchAuditExportRequests(params: {
  from?: string;
  to?: string;
  page?: number;
  size?: number;
  applicantUserId?: string;
  applicantGroup?: string;
}) {
  const res = await authHttp.get<Result<{ data: MaterialRequest[]; total: number }>>("/material/admin/audit/requests", { params });
  return res.data.data;
}

export async function fetchApplicantsWithRecords(params?: { from?: string; to?: string }) {
  const res = await authHttp.get<Result<Array<{ userId: string; applicantName: string }>>>("/material/admin/applicants-with-records", { params });
  return res.data.data ?? [];
}

export async function fetchGroupsWithRecords(params?: { from?: string; to?: string }) {
  const res = await authHttp.get<Result<string[]>>("/material/admin/groups-with-records", { params });
  return res.data.data ?? [];
}

export async function fetchItemClaimLines(itemId: number, params: { from?: string; to?: string; applicantGroup?: string; page: number; size: number }) {
  const res = await authHttp.get<Result<{ data: MaterialItemClaimRow[]; total: number }>>(`/material/admin/audit/item/${itemId}/claims`, { params });
  return res.data.data;
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
  passRate?: number;
  refuseCount?: number;
  stockWarnings?: Array<{ itemId: number; name: string; stockQty: number }>;
  byStudent: Array<Record<string, unknown>>;
  byItem: Array<Record<string, unknown>>;
}

export interface MaterialStatsAnalytics {
  totalRequests: number;
  totalRequestQty: number;
  totalOutboundQty: number;
  totalInboundQty: number;
  passRate: number;
  refuseCount: number;
  activeStudents: number;
  activeGroups: number;
  stockWarnings: Array<{ itemId: number; name: string; stockQty: number }>;
  byGroup: Array<{ groupName: string; requestCount: number; memberCount: number; totalQty: number }>;
  byStudent: Array<{ userId: string; applicantName: string; applicantGroup: string; total: number; activeDays: number; totalQty: number }>;
  byItem: Array<{ itemId: number; itemName: string; totalQty: number; requestCount: number }>;
  dailyTrend: Array<{ date: string; requestCount: number; requestQty: number; outboundQty: number; inboundQty: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  outboundHeatmap: Array<{ dayOfWeek: number; hour: number; count: number }>;
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

export async function createMaterialRequest(lines: { itemId: number; qty: number; specSnapshot?: string }[], applicantGroup?: string) {
  const res = await authHttp.post<Result<MaterialRequest[]>>("/material/requests", { lines, applicantGroup });
  return res.data.data;
}

/** 扫码快捷业务：PIN 验证后以被扫人员 token 提交，避免误用操作员身份 */
function getMaterialRequestSubmitErrorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "提交失败";
  const body = data as Record<string, unknown>;
  if (typeof body.message === "string" && body.message.trim()) return body.message;
  return "提交失败";
}

export async function createMaterialRequestWithToken(
  bearerToken: string,
  lines: { itemId: number; qty: number; specSnapshot?: string }[],
  applicantGroup?: string,
) {
  const res = await axios.post<Result<MaterialRequest[]>>(
    "/api/material/requests",
    { lines, applicantGroup },
    { headers: { Authorization: `Bearer ${bearerToken}` } },
  );
  if (!res.data?.success) {
    throw new Error(getMaterialRequestSubmitErrorMessage(res.data));
  }
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

export async function fetchAdminMaterialCategories(applicantGroup?: string) {
  const res = await authHttp.get<Result<MaterialCategory[]>>("/material/admin/categories", {
    params: applicantGroup ? { applicantGroup } : {},
  });
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

export async function fetchAdminMaterialItems(categoryId?: number, applicantGroup?: string) {
  const res = await authHttp.get<Result<MaterialItem[]>>("/material/admin/items", {
    params: { ...(categoryId != null ? { categoryId } : {}), ...(applicantGroup ? { applicantGroup } : {}) },
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

export async function fetchAllMaterialRequests(params: { page: number; size: number; status?: string; applicantUserId?: string; applicantGroup?: string }) {
  const res = await authHttp.get<Result<{ data: MaterialRequest[]; total: number }>>("/material/admin/requests/all", { params });
  return res.data.data;
}

export async function fetchFinishedMaterialRequests(params: { page: number; size: number; applicantUserId?: string; applicantGroup?: string }) {
  const res = await authHttp.get<Result<{ data: MaterialRequest[]; total: number }>>("/material/admin/requests/finished", { params });
  return res.data.data;
}

export async function approveMaterialRequest(id: string) {
  const res = await authHttp.post<Result<MaterialRequest>>(`/material/admin/requests/${id}/approve`);
  return res.data.data;
}

export async function deleteMaterialRequest(id: string) {
  await authHttp.delete(`/material/admin/requests/${id}`);
}

export async function rejectMaterialRequest(id: string) {
  await authHttp.post(`/material/admin/requests/${id}/reject`);
}

export async function revokeMaterialRequest(id: string) {
  await authHttp.post(`/material/admin/requests/${id}/revoke`);
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

export async function fetchMaterialStatsAnalytics(params: { from: string; to: string; groupId?: string }) {
  const res = await authHttp.get<Result<MaterialStatsAnalytics>>("/material/admin/stats/analytics", { params });
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
  applicantUserId?: string; applicantGroup?: string; exportLabel?: string;
}): Promise<Blob> {
  const res = await authHttp.get("/material/admin/stats/export", {
    params,
    responseType: "blob",
  });
  return res.data as Blob;
}

export async function exportMaterialItemFlow(params: {
  itemId: number; from?: string; to?: string; applicantGroup?: string; exportLabel?: string;
}): Promise<Blob> {
  const { itemId, ...rest } = params;
  const res = await authHttp.get(`/material/admin/audit/item/${itemId}/export`, {
    params: rest,
    responseType: "blob",
  });
  return res.data as Blob;
}

// ---- demand API ----

export interface MaterialDemand {
  id: number;
  userId: string;
  userName?: string;
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
