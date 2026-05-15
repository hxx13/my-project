import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface AssetColumnDef {
  id: number;
  columnKey: string;
  columnLabel: string;
  valueType: string;
  sortable: number;
  searchable: number;
  sortOrder: number;
}

export interface AssetRow {
  id: string;
  assetCode: string;
  assetName: string;
  status: string;
  location: string;
  locked: number;
  note?: string;
  latestTransferRequestId?: string;
  latestTransferTime?: string;
  latestTransferLocation?: string;
  latestTransferApplicant?: string;
  latestTransferRemark?: string;
  latestTransferStatus?: string;
  latestTransferPhotoUrl?: string;
  latestTransferPhotoUrlsBefore?: string[];
  latestTransferPhotoUrlsAfter?: string[];
  updateTime?: string;
  dynamicValues: Record<string, string>;
}

export interface AssetPagedData {
  columns: AssetColumnDef[];
  rows: AssetRow[];
  total: number;
  page: number;
  size: number;
}

export interface AssetFacets {
  assetNames: string[];
  campuses: string[];
  users?: string[];
  models: string[];
}

export interface AssetTransferRecord {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  applicantId: string;
  applicantName?: string;
  transferTime?: string;
  /** 兼容少数代理层 snake_case */
  transfer_time?: string;
  transferLocation: string;
  /** 提交申请时资产所在地（管理员删除已完成记录时可回滚） */
  fromLocation?: string | null;
  remark?: string;
  photoUrl?: string;
  photoUrlsBefore?: string | null;
  photoUrlsAfter?: string | null;
  status: string;
  createTime?: string;
  create_time?: string;
}

export interface TransferPagedData {
  rows: AssetTransferRecord[];
  total: number;
  page: number;
  size: number;
}

export interface TransferPdfLinkItem {
  id: string;
  requestId: string;
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

export interface AssetRecycleRow {
  id: string;
  assetCode: string;
  assetName: string;
  location?: string;
  deletedTime?: string;
  deletedBy?: string;
  purgeAfterTime?: string;
}

export interface AssetRecyclePagedData {
  rows: AssetRecycleRow[];
  total: number;
  page: number;
  size: number;
}

export async function fetchAssetRecords(params: {
  page: number;
  size: number;
  keyword?: string;
  /** 精确按资产主键拉取一条（用于转移记录摘要等，避免关键词分页找不到） */
  assetId?: string;
  assetName?: string;
  campus?: string;
  user?: string;
  model?: string;
  lockStatus?: number;
  status?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}) {
  const res = await authHttp.get<Result<AssetPagedData>>("/v1/assets", { params });
  return res.data.data;
}

export async function importAssetExcel(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await authHttp.post<Result<{ created: number; updated: number; skipped: number }>>("/v1/assets/import", form, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data.data;
}

export async function exportAssetExcel(params: {
  keyword?: string;
  assetName?: string;
  user?: string;
  model?: string;
  lockStatus?: number;
  status?: string;
}) {
  const res = await authHttp.get<Blob>("/v1/assets/export", {
    params,
    responseType: "blob",
  });
  return res.data;
}

export async function createAssetColumn(columnLabel: string) {
  const res = await authHttp.post<Result<{ columnKey: string; columnLabel: string }>>("/v1/assets/columns", { columnLabel });
  return res.data.data;
}

export async function patchAssetRecord(id: string, payload: { note?: string; status?: string; location?: string; dynamicValues?: Record<string, string> }) {
  const res = await authHttp.patch<Result<{ id: string }>>(`/v1/assets/${encodeURIComponent(id)}`, payload);
  return res.data.data;
}

export async function searchAssets(keyword: string, limit = 20) {
  const res = await authHttp.get<Result<Array<Pick<AssetRow, "id" | "assetCode" | "assetName" | "location" | "status" | "locked">>>>("/v1/assets/search", {
    params: { keyword, limit },
  });
  return res.data.data;
}

export async function lockAsset(id: string) {
  await authHttp.post(`/v1/assets/${encodeURIComponent(id)}/lock`);
}

export async function submitTransferRequest(payload: {
  assetId: string;
  transferTime: string;
  transferLocation: string;
  remark?: string;
  photoUrl?: string;
  photoUrlsBefore?: string[];
  photoUrlsAfter?: string[];
}) {
  const res = await authHttp.post<Result<{ requestId: string; status?: string }>>("/v1/asset-transfer-requests", payload);
  return res.data.data;
}

export async function appendTransferAfterPhotos(requestId: string, photoUrls: string[]) {
  const res = await authHttp.patch<Result<{ requestId: string; photoUrlsAfter: string[] }>>(
    `/v1/asset-transfer-requests/${encodeURIComponent(requestId)}/after-photos`,
    { photoUrls }
  );
  return res.data.data;
}

export async function removeTransferAfterPhoto(requestId: string, photoUrl: string) {
  const res = await authHttp.post<Result<{ requestId: string; photoUrlsAfter?: string[] }>>(
    `/v1/asset-transfer-requests/${encodeURIComponent(requestId)}/after-photos/remove`,
    { photoUrls: [photoUrl] }
  );
  return res.data.data;
}

export async function completeTransferRequest(requestId: string) {
  const res = await authHttp.post<Result<{ requestId: string; status?: string }>>(
    `/v1/asset-transfer-requests/${encodeURIComponent(requestId)}/complete`
  );
  return res.data.data;
}

export async function withdrawTransferRequest(requestId: string) {
  const res = await authHttp.post<Result<{ requestId: string; status?: string }>>(
    `/v1/asset-transfer-requests/${encodeURIComponent(requestId)}/withdraw`
  );
  return res.data.data;
}

export async function deleteTransferRecordAdmin(requestId: string) {
  const res = await authHttp.delete<Result<{ requestId: string; deleted?: boolean }>>(
    `/v1/asset-transfer-requests/${encodeURIComponent(requestId)}`
  );
  return res.data.data;
}

export async function fetchTransferRecords(params: { page: number; size: number; keyword?: string }) {
  const res = await authHttp.get<Result<TransferPagedData>>("/v1/asset-transfer-records", { params });
  return res.data.data;
}

export async function createOrReuseTransferPdfLink(requestId: string) {
  const res = await authHttp.post<Result<TransferPdfLinkItem>>(
    `/v1/asset-transfer-records/${encodeURIComponent(requestId)}/pdf-link`
  );
  return res.data.data;
}

export async function listTransferPdfLinks(requestId: string) {
  const res = await authHttp.get<Result<{ requestId: string; links: TransferPdfLinkItem[] }>>(
    `/v1/asset-transfer-records/${encodeURIComponent(requestId)}/pdf-links`
  );
  return res.data.data;
}

export async function fetchAssetFacets(params?: { keyword?: string; assetName?: string; user?: string; model?: string }) {
  const res = await authHttp.get<Result<AssetFacets>>("/v1/assets/facets", { params });
  return res.data.data;
}

export async function clearAssetTable() {
  const res = await authHttp.delete<Result<{
    assetRows: number;
    dynamicColumns: number;
    valueRows: number;
    transferRequests: number;
    transferLogs: number;
  }>>("/v1/assets");
  return res.data.data;
}

export async function createAssetRecord(payload: {
  assetCode: string;
  assetName: string;
  status?: string;
  location?: string;
  note?: string;
  dynamicValues?: Record<string, string>;
}) {
  const res = await authHttp.post<Result<{ id: string }>>("/v1/assets", payload);
  return res.data.data;
}

export async function deleteAssetRecord(id: string) {
  const res = await authHttp.delete<Result<{ id: string; purgeAfterTime: string }>>(`/v1/assets/${encodeURIComponent(id)}`);
  return res.data.data;
}

export async function fetchAssetRecycle(params: { page: number; size: number; keyword?: string }) {
  const res = await authHttp.get<Result<AssetRecyclePagedData>>("/v1/assets/recycle", { params });
  return res.data.data;
}

export async function restoreRecycleAsset(id: string) {
  const res = await authHttp.post<Result<{ id: string; restored: boolean }>>(`/v1/assets/recycle/${encodeURIComponent(id)}/restore`);
  return res.data.data;
}

export async function purgeRecycleAsset(id: string) {
  const res = await authHttp.delete<Result<{ id: string; purged: boolean }>>(`/v1/assets/recycle/${encodeURIComponent(id)}`);
  return res.data.data;
}

export async function exportTransferRecords(params: { keyword?: string }) {
  const res = await authHttp.get<Blob>("/v1/asset-transfer-records/export", {
    params,
    responseType: "blob",
  });
  return res.data;
}

