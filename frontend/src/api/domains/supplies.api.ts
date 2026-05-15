import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface SupplyCategory {
  id: number;
  name: string;
  sortOrder: number;
  status: number;
}

export interface SupplyItem {
  id: number;
  categoryId: number;
  name: string;
  subtitle?: string;
  coverUrl?: string;
  shelfStatus: string;
  stockMode: string;
  stockQty: number;
  deleted?: number;
  deletedTime?: string;
  deletedBy?: string;
  purgeAfterTime?: string;
  createdAt?: string;
  lastInboundAt?: string;
  isNewItem?: boolean;
  isNewInbound?: boolean;
  noveltyTag?: string;
}

export interface SupplyClaimLine {
  id: number;
  itemId: number;
  qty: number;
  snapshotName: string;
  fulfilledQty: number;
}

export interface SupplyClaimOrder {
  id: string;
  userId: string;
  applicantName?: string;
  status: string;
  createdAt: string;
  fulfilledAt?: string;
  fulfilledBy?: string;
  /** 出库处理人展示名（与导出 Excel 一致：优先展示昵称） */
  fulfilledByName?: string;
  lines?: SupplyClaimLine[];
  /** 回收站列表可能返回 */
  deletedTime?: string;
  purgeAfterTime?: string;
}

export interface SupplyClaimPdfLinkItem {
  id: string;
  claimId: string;
  fileName: string;
  status: "GENERATING" | "READY" | "FAILED" | "EXPIRED" | string;
  expireAt?: string;
  summaryText?: string;
  downloadToken: string;
  downloadPath: string;
  downloadUrl: string;
  reused?: boolean;
  createdTime?: string;
}

export async function fetchSupplyCategories() {
  const res = await authHttp.get<Result<SupplyCategory[]>>("/supplies/categories");
  return res.data.data;
}

export async function fetchSupplyItems(categoryId?: number) {
  const res = await authHttp.get<Result<SupplyItem[]>>("/supplies/items", {
    params: categoryId != null ? { categoryId } : {},
  });
  return res.data.data;
}

/** GET /supplies/cart：当前登录用户云端购物车（与小程序同源）。 */
export async function fetchSupplyCart(): Promise<Record<number, number>> {
  const res = await authHttp.get<Result<{ lines?: Record<string, number> }>>("/supplies/cart");
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

/** PUT /supplies/cart：保存云端购物车。 */
export async function saveSupplyCart(cart: Record<number, number>): Promise<void> {
  const lines: Record<string, number> = {};
  for (const [k, v] of Object.entries(cart)) {
    const id = Number(k);
    const qty = Number(v);
    if (Number.isFinite(id) && id > 0 && Number.isFinite(qty) && qty > 0) {
      lines[String(id)] = Math.min(Math.floor(qty), 999);
    }
  }
  const res = await authHttp.put<Result<unknown>>("/supplies/cart", { lines });
  if (!res.data.success) {
    throw new Error(res.data.message || "保存购物车失败");
  }
}

export async function fetchSupplyItem(id: number) {
  const res = await authHttp.get<Result<SupplyItem>>(`/supplies/items/${id}`);
  return res.data.data;
}

export async function markSupplyItemsViewed() {
  await authHttp.post("/supplies/items/mark-viewed");
}

export async function createSupplyClaim(lines: { itemId: number; qty: number }[]) {
  const res = await authHttp.post<Result<SupplyClaimOrder>>("/supplies/claims", { lines });
  return res.data.data;
}

export async function withdrawSupplyClaim(id: string) {
  await authHttp.post(`/supplies/claims/${id}/withdraw`);
}

/** PUT /supplies/claims/{id}/lines：修订待出库领用单（与小程序 supplies 提交「完成修改」一致） */
export async function revisePendingSupplyClaimLines(claimId: string, lines: { itemId: number; qty: number }[]) {
  const res = await authHttp.put<Result<SupplyClaimOrder>>(
    `/supplies/claims/${encodeURIComponent(claimId)}/lines`,
    { lines },
  );
  return res.data.data;
}

/** DELETE /supplies/claims/{id}：删除我的领用单（进回收站，与小程序 suppliesMine 一致） */
export async function deleteMySupplyClaim(id: string) {
  await authHttp.delete(`/supplies/claims/${encodeURIComponent(id)}`);
}

/** GET /supplies/claims/recycle/mine */
export async function fetchMySupplyClaimRecycle(params: { page: number; size: number }) {
  const res = await authHttp.get<Result<{ data: SupplyClaimOrder[]; total: number }>>("/supplies/claims/recycle/mine", {
    params,
  });
  return res.data.data;
}

/** POST /supplies/claims/recycle/{id}/restore */
export async function restoreMySupplyClaimRecycle(id: string) {
  await authHttp.post(`/supplies/claims/recycle/${encodeURIComponent(id)}/restore`);
}

export async function fetchSupplyPendingTasks() {
  const res = await authHttp.get<Result<SupplyClaimOrder[]>>("/supplies/claims/pending-tasks");
  return res.data.data;
}

export async function fetchSupplyRecentClosedClaims(limit = 40) {
  const res = await authHttp.get<Result<SupplyClaimOrder[]>>("/supplies/claims/recent-closed", {
    params: { limit },
  });
  return res.data.data;
}

export async function fetchSupplyMine(params: { page: number; size: number; status?: string }) {
  const res = await authHttp.get<Result<{ data: SupplyClaimOrder[]; total: number }>>("/supplies/claims/mine", {
    params,
  });
  return res.data.data;
}

/** GET /supplies/claims/mine-range：按领用人 + 申请日期区间（含首尾日） */
export interface SupplyMineRangePack {
  from: string;
  to: string;
  applicantUserId: string;
  applicantDisplayName?: string;
  total: number;
  data: SupplyClaimOrder[];
}

export async function fetchSupplyMineRange(params: { from: string; to: string; applicantUserId?: string }) {
  const res = await authHttp.get<Result<SupplyMineRangePack>>("/supplies/claims/mine-range", {
    params: {
      from: params.from,
      to: params.to,
      ...(params.applicantUserId?.trim() ? { applicantUserId: params.applicantUserId.trim() } : {}),
    },
  });
  return res.data.data;
}

/** GET /supplies/claims/applicant-options：区间领用人下拉（与小程序 suppliesAudit 一致） */
export interface SupplyClaimApplicantOption {
  userId: string;
  displayName?: string;
}

export async function fetchSupplyClaimApplicantOptions() {
  const res = await authHttp.get<Result<SupplyClaimApplicantOption[]>>("/supplies/claims/applicant-options");
  return res.data.data ?? [];
}

export async function fetchSupplyClaimDetail(id: string) {
  const res = await authHttp.get<Result<SupplyClaimOrder>>(`/supplies/claims/${id}`);
  return res.data.data;
}

export async function createOrReuseSupplyClaimPdfLink(claimId: string) {
  const res = await authHttp.post<Result<SupplyClaimPdfLinkItem>>(`/supplies/claims/${encodeURIComponent(claimId)}/pdf-link`);
  return res.data.data;
}

export async function listSupplyClaimPdfLinks(claimId: string) {
  const res = await authHttp.get<Result<{ claimId: string; links: SupplyClaimPdfLinkItem[] }>>(
    `/supplies/claims/${encodeURIComponent(claimId)}/pdf-links`
  );
  return res.data.data;
}

export async function deleteSupplyClaimPdfLink(claimId: string, linkId: string) {
  await authHttp.delete(`/supplies/claims/${encodeURIComponent(claimId)}/pdf-links/${encodeURIComponent(linkId)}`);
}

export async function fulfillSupplyClaim(id: string, lines: { lineId: number; grant: boolean; fulfillQty?: number }[]) {
  const res = await authHttp.post<Result<SupplyClaimOrder>>(`/supplies/admin/claims/${id}/fulfill`, { lines });
  return res.data.data;
}

export async function deleteAdminSupplyClaim(id: string) {
  await authHttp.delete(`/supplies/admin/claims/${id}`);
}

export async function fetchAdminClaimRecycle(params: { page: number; size: number }) {
  const res = await authHttp.get<Result<{ data: SupplyClaimOrder[]; total: number }>>("/supplies/admin/claims/recycle", { params });
  return res.data.data;
}

export async function restoreAdminClaimRecycle(id: string) {
  await authHttp.post(`/supplies/admin/claims/recycle/${encodeURIComponent(id)}/restore`);
}

export async function purgeAdminClaimRecycle(id: string) {
  await authHttp.delete(`/supplies/admin/claims/recycle/${encodeURIComponent(id)}`);
}

export async function purgeAdminClaimRecycleByIds(ids: string[]) {
  const res = await authHttp.post<Result<{ deleted: number }>>("/supplies/admin/claims/recycle/purge", { ids });
  return res.data.data;
}

export async function purgeAllAdminClaimRecycle() {
  const res = await authHttp.delete<Result<{ deleted: number }>>("/supplies/admin/claims/recycle");
  return res.data.data;
}

/** Admin */
export async function fetchAdminSupplyCategories() {
  const res = await authHttp.get<Result<SupplyCategory[]>>("/supplies/admin/categories");
  return res.data.data;
}

export async function createAdminSupplyCategory(body: { name: string; sortOrder?: number; status?: number }) {
  const res = await authHttp.post<Result<SupplyCategory>>("/supplies/admin/categories", body);
  return res.data.data;
}

export async function updateAdminSupplyCategory(id: number, body: Partial<{ name: string; sortOrder: number; status: number }>) {
  const res = await authHttp.patch<Result<SupplyCategory>>(`/supplies/admin/categories/${id}`, body);
  return res.data.data;
}

export async function deleteAdminSupplyCategory(id: number) {
  await authHttp.delete(`/supplies/admin/categories/${id}`);
}

export async function fetchAdminSupplyItems(categoryId?: number) {
  const res = await authHttp.get<Result<SupplyItem[]>>("/supplies/admin/items", {
    params: categoryId != null ? { categoryId } : {},
  });
  return res.data.data;
}

export async function createAdminSupplyItem(body: Partial<SupplyItem> & { categoryId: number; name: string }) {
  const res = await authHttp.post<Result<SupplyItem>>("/supplies/admin/items", body);
  return res.data.data;
}

export async function updateAdminSupplyItem(id: number, body: Partial<SupplyItem>) {
  const res = await authHttp.patch<Result<SupplyItem>>(`/supplies/admin/items/${id}`, body);
  return res.data.data;
}

export async function deleteAdminSupplyItem(id: number) {
  await authHttp.delete(`/supplies/admin/items/${id}`);
}

export async function fetchAdminSupplyRecycle(params: { page: number; size: number }) {
  const res = await authHttp.get<Result<{ data: SupplyItem[]; total: number }>>("/supplies/admin/items/recycle", { params });
  return res.data.data;
}

export async function restoreAdminSupplyRecycle(id: number) {
  await authHttp.post(`/supplies/admin/items/recycle/${id}/restore`);
}

export async function purgeAdminSupplyRecycle(id: number) {
  await authHttp.delete(`/supplies/admin/items/recycle/${id}`);
}

export async function purgeAdminSupplyRecycleByIds(ids: number[]) {
  const res = await authHttp.post<Result<{ deleted: number }>>("/supplies/admin/items/recycle/purge", { ids });
  return res.data.data;
}

export async function purgeAllAdminSupplyRecycle() {
  const res = await authHttp.delete<Result<{ deleted: number }>>("/supplies/admin/items/recycle");
  return res.data.data;
}

export async function inboundSupplyItem(body: { itemId: number; qty: number }) {
  const res = await authHttp.post<Result<SupplyItem>>("/supplies/admin/inbound", body);
  return res.data.data;
}

export async function adjustSupplyStock(id: number, newQty: number) {
  const res = await authHttp.patch<Result<SupplyItem>>(`/supplies/admin/items/${id}/stock`, { newQty });
  return res.data.data;
}

export interface SupplyInventoryMovementRow {
  id: number;
  itemId: number;
  itemName?: string;
  itemCategoryId?: number;
  categoryName?: string;
  movementType: string;
  qty: number;
  stockAfter?: number | null;
  claimId?: string | null;
  claimLineId?: number | null;
  operatorUserId?: string | null;
  operatorName?: string | null;
  applicantUserId?: string | null;
  applicantName?: string | null;
  remark?: string | null;
  createdAt?: string | null;
}

export interface SupplyAuditRestoredRow {
  outboundTime?: string | null;
  claimId?: string | null;
  itemName?: string | null;
  applyQty?: number | null;
  outboundQty?: number | null;
  applicantUserId?: string | null;
  fulfilledByUserId?: string | null;
  applicantName?: string | null;
  fulfilledByName?: string | null;
}

/** 有库存流水或已完成领用实发明细的物资 id（审计页物品下拉优先展示） */
export async function fetchAuditItemIdsWithRecords(categoryId?: number) {
  const res = await authHttp.get<Result<number[]>>("/supplies/admin/audit/item-ids-with-records", {
    params: categoryId != null ? { categoryId } : {},
  });
  return res.data.data ?? [];
}

export async function fetchAuditInventoryMovements(params: { itemId: number; page: number; size: number }) {
  const res = await authHttp.get<
    Result<{
      data: SupplyInventoryMovementRow[];
      total: number;
      restoredData: SupplyAuditRestoredRow[];
      restoredTotal: number;
    }>
  >("/supplies/admin/audit/inventory-movements", { params });
  return res.data.data;
}

export async function downloadPersonalClaimExcel(claimId: string): Promise<Blob> {
  const res = await authHttp.get(`/supplies/claims/${encodeURIComponent(claimId)}/export/personal/excel`, {
    responseType: "blob",
  });
  return res.data as Blob;
}

export async function downloadPersonalClaimsRangeExcel(params: {
  from: string;
  to: string;
  applicantUserId?: string;
}): Promise<Blob> {
  const res = await authHttp.get("/supplies/claims/mine-range/export/excel", {
    params: {
      from: params.from,
      to: params.to,
      ...(params.applicantUserId?.trim() ? { applicantUserId: params.applicantUserId.trim() } : {}),
    },
    responseType: "blob",
  });
  return res.data as Blob;
}

export async function downloadAuditItemExcel(itemId: number): Promise<Blob> {
  const res = await authHttp.get(`/supplies/admin/audit/items/${itemId}/export/excel`, {
    responseType: "blob",
  });
  return res.data as Blob;
}
