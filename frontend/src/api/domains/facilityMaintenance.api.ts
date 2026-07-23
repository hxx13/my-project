import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export type FmTab = "sites" | "optionSets" | "templates" | "inspection" | "consumables" | "replacements";

export interface FmSite {
  id: string;
  name: string;
  code?: string | null;
  sortOrder?: number;
  sort_order?: number;
  disabled?: number;
}

export interface FmOptionItem {
  id: string;
  label: string;
  sortOrder?: number;
}

export interface FmOptionSet {
  id: string;
  name: string;
  items?: FmOptionItem[];
}

export interface FmTemplateItem {
  id?: string;
  label: string;
  fieldType: string;
  optionSetId?: string | null;
  /** SELECT 项由后端挂载，矩阵下拉用 */
  optionItems?: { id?: string; label: string; sortOrder?: number }[];
  requiredFlag?: number;
  required?: boolean;
  sortOrder?: number;
}

export interface FmTemplate {
  id: string;
  siteId?: string | null;
  /** 适用机房（多选）；空数组表示全局 */
  siteIds?: string[];
  name: string;
  items?: FmTemplateItem[];
}

export async function fetchFmSites(includeDisabled = false) {
  const res = await authHttp.get<Result<FmSite[]>>("/v1/facility-maintenance/sites", {
    params: { includeDisabled },
  });
  return res.data.data;
}

export async function createFmSite(body: { name: string; code?: string; sortOrder?: number }) {
  const res = await authHttp.post<Result<{ id: string }>>("/v1/facility-maintenance/sites", body);
  return res.data.data;
}

export async function patchFmSite(
  id: string,
  body: { name?: string; code?: string | null; sortOrder?: number; disabled?: number }
) {
  await authHttp.patch<Result<unknown>>(`/v1/facility-maintenance/sites/${encodeURIComponent(id)}`, body);
}

/** 软停用机房（disabled=1），与 PATCH { disabled: 1 } 等价 */
export async function deleteFmSite(id: string) {
  await authHttp.delete<Result<unknown>>(`/v1/facility-maintenance/sites/${encodeURIComponent(id)}`);
}

/** 从库中永久删除机房行 */
export async function deleteFmSitePermanent(id: string) {
  await authHttp.delete<Result<unknown>>(
    `/v1/facility-maintenance/sites/${encodeURIComponent(id)}/permanent`
  );
}

export async function fetchFmOptionSets() {
  const res = await authHttp.get<Result<FmOptionSet[]>>("/v1/facility-maintenance/option-sets");
  return res.data.data;
}

export async function createFmOptionSet(body: { name: string; items: { label: string; sortOrder?: number }[] }) {
  const res = await authHttp.post<Result<{ id: string }>>("/v1/facility-maintenance/option-sets", body);
  return res.data.data;
}

export async function patchFmOptionSet(
  id: string,
  body: { name?: string; items?: { label: string; sortOrder?: number }[] }
) {
  await authHttp.patch<Result<unknown>>(`/v1/facility-maintenance/option-sets/${encodeURIComponent(id)}`, body);
}

export async function deleteFmOptionSet(id: string) {
  await authHttp.delete<Result<unknown>>(`/v1/facility-maintenance/option-sets/${encodeURIComponent(id)}`);
}

export async function fetchFmTemplates(siteId?: string) {
  const res = await authHttp.get<Result<FmTemplate[]>>("/v1/facility-maintenance/templates", {
    params: siteId ? { siteId } : {},
  });
  return res.data.data;
}

export async function getFmTemplate(id: string) {
  const res = await authHttp.get<Result<FmTemplate>>(`/v1/facility-maintenance/templates/${encodeURIComponent(id)}`);
  return res.data.data;
}

export async function createFmTemplate(body: {
  siteId?: string | null;
  /** 与 siteId 二选一：传数组时走后端多机房关联（含空数组=全局） */
  siteIds?: string[];
  name: string;
  items: { label: string; fieldType: string; optionSetId?: string | null; required?: boolean; sortOrder?: number }[];
}) {
  const res = await authHttp.post<Result<{ id: string }>>("/v1/facility-maintenance/templates", body);
  return res.data.data;
}

export async function patchFmTemplate(
  id: string,
  body: {
    siteId?: string | null;
    siteIds?: string[];
    name?: string;
    items?: { label: string; fieldType: string; optionSetId?: string | null; required?: boolean; sortOrder?: number }[];
  }
) {
  await authHttp.patch<Result<unknown>>(`/v1/facility-maintenance/templates/${encodeURIComponent(id)}`, body);
}

export async function deleteFmTemplate(id: string) {
  await authHttp.delete<Result<unknown>>(`/v1/facility-maintenance/templates/${encodeURIComponent(id)}`);
}

/** 按日协作巡查表（机房×模板项） */
export async function fetchOrCreateDailyInspectionSheet(date: string, templateId?: string) {
  const res = await authHttp.get<Result<Record<string, unknown>>>(`/v1/facility-maintenance/daily-inspection-sheets`, {
    params: { date, ...(templateId ? { templateId } : {}) },
  });
  return res.data.data;
}

export interface FmDailyInspectionSheetSummary {
  id: string;
  sheetDate: string;
  templateId: string;
  templateName: string;
  status: string;
  version: number;
  submittedAt?: string | null;
  submittedByName?: string | null;
}

export async function fetchDailyInspectionSheetSummaries(page = 1, size = 20) {
  const res = await authHttp.get<
    Result<{ total: number; page: number; size: number; rows: FmDailyInspectionSheetSummary[] }>
  >("/v1/facility-maintenance/daily-inspection-sheets/summaries", {
    params: { page, size },
  });
  return res.data.data;
}

export async function patchDailyInspectionSheetApi(
  id: string,
  body: { cells: Record<string, string>; version: number }
) {
  const res = await authHttp.patch<Result<Record<string, unknown>>>(
    `/v1/facility-maintenance/daily-inspection-sheets/${encodeURIComponent(id)}`,
    body
  );
  return res.data.data;
}

export async function submitDailyInspectionSheetApi(id: string) {
  await authHttp.post<Result<unknown>>(`/v1/facility-maintenance/daily-inspection-sheets/${encodeURIComponent(id)}/submit`, {});
}

/** 删除某日协作表整行，释放该业务日以便重新选模板 */
export async function deleteDailyInspectionSheetApi(id: string) {
  await authHttp.delete<Result<unknown>>(`/v1/facility-maintenance/daily-inspection-sheets/${encodeURIComponent(id)}`);
}

export async function exportDailyInspectionSheetExcelApi(id: string) {
  const res = await authHttp.get<Blob>(`/v1/facility-maintenance/daily-inspection-sheets/${encodeURIComponent(id)}/export-excel`, {
    responseType: "blob",
  });
  return res.data;
}

export interface FmConsumableCatalog {
  id: string;
  name: string;
  unit?: string | null;
  sortOrder?: number;
  disabled?: number;
}

export async function fetchFmConsumableCatalog(includeDisabled = false) {
  const res = await authHttp.get<Result<FmConsumableCatalog[]>>("/v1/facility-maintenance/consumable-catalog", {
    params: { includeDisabled },
  });
  return res.data.data;
}

export async function createFmConsumableCatalog(body: { name: string; unit?: string; sortOrder?: number }) {
  const res = await authHttp.post<Result<{ id: string }>>("/v1/facility-maintenance/consumable-catalog", body);
  return res.data.data;
}

export async function patchFmConsumableCatalog(
  id: string,
  body: { name?: string; unit?: string | null; sortOrder?: number; disabled?: number }
) {
  await authHttp.patch<Result<unknown>>(`/v1/facility-maintenance/consumable-catalog/${encodeURIComponent(id)}`, body);
}

export async function deleteFmConsumableCatalog(id: string) {
  await authHttp.delete<Result<unknown>>(`/v1/facility-maintenance/consumable-catalog/${encodeURIComponent(id)}`);
}

export interface FmReplacementFilterPreset {
  id: string;
  label: string;
  sortOrder?: number;
  disabled?: number;
}

export async function fetchFmReplacementFilterPresets(includeDisabled = false) {
  const res = await authHttp.get<Result<FmReplacementFilterPreset[]>>("/v1/facility-maintenance/replacement-filter-presets", {
    params: { includeDisabled },
  });
  return res.data.data;
}

export async function createFmReplacementFilterPreset(body: { label: string; sortOrder?: number }) {
  const res = await authHttp.post<Result<{ id: string }>>("/v1/facility-maintenance/replacement-filter-presets", body);
  return res.data.data;
}

export async function patchFmReplacementFilterPreset(
  id: string,
  body: { label?: string; sortOrder?: number; disabled?: number }
) {
  await authHttp.patch<Result<unknown>>(
    `/v1/facility-maintenance/replacement-filter-presets/${encodeURIComponent(id)}`,
    body
  );
}

export async function deleteFmReplacementFilterPreset(id: string) {
  await authHttp.delete<Result<unknown>>(`/v1/facility-maintenance/replacement-filter-presets/${encodeURIComponent(id)}`);
}

export async function fetchFmInspectionRecords(params: { siteId?: string; page?: number; size?: number }) {
  const res = await authHttp.get<Result<{ rows: Record<string, unknown>[]; total: number; page: number; size: number }>>(
    "/v1/facility-maintenance/inspection-records",
    { params }
  );
  return res.data.data;
}

export async function createFmInspectionRecord(body: {
  siteId: string;
  templateId?: string | null;
  inspectedAt?: string | null;
  values?: Record<string, string>;
}) {
  const res = await authHttp.post<Result<{ id: string }>>("/v1/facility-maintenance/inspection-records", body);
  return res.data.data;
}

export async function patchFmInspectionRecord(id: string, body: Record<string, unknown>) {
  await authHttp.patch<Result<unknown>>(`/v1/facility-maintenance/inspection-records/${encodeURIComponent(id)}`, body);
}

export async function deleteFmInspectionRecord(id: string) {
  await authHttp.delete<Result<unknown>>(`/v1/facility-maintenance/inspection-records/${encodeURIComponent(id)}`);
}

export async function fetchFmConsumableLines(params: { siteId?: string; page?: number; size?: number }) {
  const res = await authHttp.get<Result<{ rows: Record<string, unknown>[]; total: number; page: number; size: number }>>(
    "/v1/facility-maintenance/consumable-lines",
    { params }
  );
  return res.data.data;
}

export async function createFmConsumableLine(body: Record<string, unknown>) {
  const res = await authHttp.post<Result<{ id: string }>>("/v1/facility-maintenance/consumable-lines", body);
  return res.data.data;
}

export async function patchFmConsumableLine(id: string, body: Record<string, unknown>) {
  await authHttp.patch<Result<unknown>>(`/v1/facility-maintenance/consumable-lines/${encodeURIComponent(id)}`, body);
}

export async function deleteFmConsumableLine(id: string) {
  await authHttp.delete<Result<unknown>>(`/v1/facility-maintenance/consumable-lines/${encodeURIComponent(id)}`);
}

export async function fetchFmReplacementRecords(params: { siteId?: string; page?: number; size?: number }) {
  const res = await authHttp.get<Result<{ rows: Record<string, unknown>[]; total: number; page: number; size: number }>>(
    "/v1/facility-maintenance/replacement-records",
    { params }
  );
  return res.data.data;
}

export async function fetchFmReplacementSummary(siteId: string) {
  const res = await authHttp.get<Result<Record<string, unknown>[]>>("/v1/facility-maintenance/replacement-summary", {
    params: { siteId },
  });
  return res.data.data;
}

export async function createFmReplacementRecord(body: Record<string, unknown>) {
  const res = await authHttp.post<Result<{ id: string }>>("/v1/facility-maintenance/replacement-records", body);
  return res.data.data;
}

export async function patchFmReplacementRecord(id: string, body: Record<string, unknown>) {
  await authHttp.patch<Result<unknown>>(`/v1/facility-maintenance/replacement-records/${encodeURIComponent(id)}`, body);
}

export async function deleteFmReplacementRecord(id: string) {
  await authHttp.delete<Result<unknown>>(`/v1/facility-maintenance/replacement-records/${encodeURIComponent(id)}`);
}

/** Excel：all=原四 Sheet；sites=机房；inspection/consumables/replacements=对应台账单 Sheet */
export type FmExcelScope = "all" | "sites" | "inspection" | "consumables" | "replacements";

export async function exportFmExcel(scope: FmExcelScope = "all") {
  const res = await authHttp.get<Blob>("/v1/facility-maintenance/export/excel", {
    responseType: "blob",
    params: { scope },
  });
  return res.data;
}

export async function importFmExcel(file: File, scope: FmExcelScope = "all") {
  const form = new FormData();
  form.append("file", file);
  const res = await authHttp.post<Result<Record<string, number>>>("/v1/facility-maintenance/import/excel", form, {
    headers: { "Content-Type": "multipart/form-data" },
    params: { scope },
  });
  return res.data.data;
}
