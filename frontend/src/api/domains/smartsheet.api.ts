// frontend/src/api/domains/smartsheet.api.ts
import { adminHttp } from '@/api/core/adminHttp';
import type {
  SmartSheetDefinition,
  SmartSheetRow,
  SmartSheetCreateRequest,
  SmartSheetUpdateRequest,
  SmartSheetRowUpdateRequest,
  ColumnStats,
  CellValue,
} from '@/features/smartsheet/types';

const BASE = '/smartsheet';

// ── JSON field normalization ──
// Backend stores columnsConfig/rowEntitySource/cellData as JSON strings;
// MyBatis returns them as strings — parse to objects for the frontend.

function maybeParse(v: unknown): unknown {
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

function normalizeCellValue(raw: unknown): CellValue {
  if (raw == null || raw === '') return { v: '' };
  if (typeof raw === 'string') {
    // Try parsing as JSON first (cell data may be stored as JSON string)
    if (raw.startsWith('{')) {
      try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object' && 'v' in parsed) return parsed as CellValue; } catch {}
    }
    return { v: raw };
  }
  if (typeof raw === 'object' && 'v' in (raw as any)) return raw as CellValue;
  return { v: String(raw) };
}

function denormalizeCellValue(cv: CellValue): CellValue {
  // Strip undefined fmt to minimize JSON size
  const out: CellValue = { v: cv.v };
  if (cv.fmt && Object.keys(cv.fmt).length > 0) out.fmt = cv.fmt;
  return out;
}

function normalizeSheet(raw: any): SmartSheetDefinition {
  return {
    ...raw,
    columnsConfig: (Array.isArray(raw.columnsConfig) ? raw.columnsConfig : maybeParse(raw.columnsConfig) ?? []) as SmartSheetDefinition['columnsConfig'],
    rowEntitySource: maybeParse(raw.rowEntitySource) ?? undefined,
  };
}

function normalizeRow(raw: any): SmartSheetRow {
  return {
    ...raw,
    cellData: (() => {
      const rawCd = (typeof raw.cellData === 'object' && !Array.isArray(raw.cellData) ? raw.cellData : maybeParse(raw.cellData) ?? {}) as Record<string, unknown>;
      const out: Record<string, CellValue> = {};
      for (const [k, v] of Object.entries(rawCd)) { out[k] = normalizeCellValue(v); }
      return out;
    })() as Record<string, CellValue>,
  };
}

// Sheet CRUD
export async function fetchSheetPage(page = 1, pageSize = 20) {
  const { data } = await adminHttp.get(`${BASE}/sheet/page`, { params: { page, pageSize } });
  const raw = data.data as { list: any[]; total: number };
  return { list: raw.list.map(normalizeSheet), total: raw.total };
}

export async function createSheet(req: SmartSheetCreateRequest) {
  const { data } = await adminHttp.post(`${BASE}/sheet`, req);
  return normalizeSheet(data.data);
}

export async function getSheet(id: string) {
  const { data } = await adminHttp.get(`${BASE}/sheet/${id}`);
  return normalizeSheet(data.data);
}

export async function updateSheet(id: string, req: SmartSheetUpdateRequest) {
  const { data } = await adminHttp.put(`${BASE}/sheet/${id}`, req);
  return normalizeSheet(data.data);
}

export async function deleteSheet(id: string) {
  await adminHttp.delete(`${BASE}/sheet/${id}`);
}

export async function bulkDeleteSheets(ids: string[]) {
  const { data } = await adminHttp.post(`${BASE}/sheet/bulk-delete`, ids);
  return data.data as { deleted: number };
}

export async function renameSheet(id: string, name: string) {
  await adminHttp.put(`${BASE}/sheet/${id}/rename`, { name });
}

export async function duplicateSheet(id: string, withData = false) {
  const { data } = await adminHttp.post(`${BASE}/sheet/${id}/duplicate`, null, { params: { withData } });
  return normalizeSheet(data.data);
}

export async function clearSheetData(id: string) {
  await adminHttp.post(`${BASE}/sheet/${id}/clear`);
}

export async function togglePinSheet(id: string) {
  await adminHttp.post(`${BASE}/sheet/${id}/pin`);
}

export function getExportJsonUrl(sheetId: string) {
  return `/api/admin/smartsheet/sheet/${sheetId}/export-json`;
}

export async function importJsonBackup(sheetId: string, backup: object) {
  const { data } = await adminHttp.post(`${BASE}/sheet/${sheetId}/import-json`, backup);
  return data.data as { imported: number };
}

// Row CRUD
export async function fetchRows(sheetId: string) {
  const { data } = await adminHttp.get(`${BASE}/${sheetId}/rows`);
  return (data.data as any[]).map(normalizeRow);
}

export async function addRow(sheetId: string, rowLabel = '', rowEntityId?: string) {
  const { data } = await adminHttp.post(`${BASE}/${sheetId}/row`, { rowLabel, rowEntityId });
  return normalizeRow(data.data);
}

export async function updateRow(sheetId: string, rowId: string, req: SmartSheetRowUpdateRequest) {
  const { data } = await adminHttp.put(`${BASE}/${sheetId}/row/${rowId}`, req);
  return normalizeRow(data.data);
}

export async function deleteRow(sheetId: string, rowId: string) {
  await adminHttp.delete(`${BASE}/${sheetId}/row/${rowId}`);
}

export async function batchRows(sheetId: string, rows: { rowLabel: string; cellData: Record<string, string> }[]) {
  const { data } = await adminHttp.post(`${BASE}/${sheetId}/rows/batch`, rows);
  return data.data as { inserted: number };
}

// Export / Import
export function getExportUrl(sheetId: string) {
  return `/api/admin/smartsheet/${sheetId}/export`;
}

export async function importFile(sheetId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await adminHttp.post(`${BASE}/${sheetId}/import`, form);
  return data.data;
}

// Stats
export async function fetchColumnStats(sheetId: string, columnKey: string) {
  const { data } = await adminHttp.get(`${BASE}/${sheetId}/stats`, { params: { columnKey } });
  return data.data as ColumnStats;
}
