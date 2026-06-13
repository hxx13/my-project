// frontend/src/api/domains/smartsheet.api.ts
import { adminHttp } from '@/api/core/adminHttp';
import type {
  SmartSheetDefinition,
  SmartSheetRow,
  SmartsheetSheetRequest,
  SmartsheetImportResult,
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
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawCd)) {
        // Unwrap legacy CellValue { v: ..., fmt: ... } wrapper
        if (v && typeof v === 'object' && 'v' in (v as Record<string, unknown>)) {
          out[k] = (v as Record<string, unknown>).v ?? '';
        } else {
          // Preserve native types: boolean, number, string, null
          out[k] = v;
        }
      }
      return out;
    })(),
  };
}

// Sheet CRUD
export async function fetchSheetPage(page = 1, pageSize = 20) {
  const { data } = await adminHttp.get(`${BASE}/sheet/page`, { params: { page, pageSize } });
  const raw = data.data as { list: any[]; total: number };
  return { list: raw.list.map(normalizeSheet), total: raw.total };
}

export async function createSheet(req: SmartsheetSheetRequest) {
  const { data } = await adminHttp.post(`${BASE}/sheet`, req);
  return normalizeSheet(data.data);
}

export async function getSheet(id: string) {
  const { data } = await adminHttp.get(`${BASE}/sheet/${id}`);
  return normalizeSheet(data.data);
}

export async function updateSheet(id: string, req: Record<string, unknown>) {
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

export async function updateRow(sheetId: string, rowId: string, req: { cellData?: Record<string, string>; rowLabel?: string; version?: number }) {
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

// ═══════ Import (UPDATED) ═══════
export async function importFile(sheetId: string, file: File) {
  const form = new FormData(); form.append('file', file);
  const { data } = await adminHttp.post(`${BASE}/${sheetId}/import`, form);
  return data.data as SmartsheetImportResult;
}

// ═══════ Template delete (NEW) ═══════
export async function deleteTemplate(id: string) {
  await adminHttp.delete(`${BASE}/template/${id}`);
}

// Stats
export async function fetchColumnStats(sheetId: string, columnKey: string) {
  const { data } = await adminHttp.get(`${BASE}/${sheetId}/stats`, { params: { columnKey } });
  return data.data as Record<string, unknown>;
}

// ═══════ Cell update (NEW - PATCH single cell) ═══════
export async function updateCell(sheetId: string, rowId: string, req: {
  columnKey: string;
  value: unknown;
  expectedVersion: number;
}) {
  const { data } = await adminHttp.patch(`${BASE}/${sheetId}/row/${rowId}/cell`, req);
  return normalizeRow(data.data);
}

// ═══════ Export URLs (multi-format) ═══════
export function getCsvExportUrl(sheetId: string) {
  return `/api/admin/smartsheet/${sheetId}/export/csv`;
}

export function getXlsxExportUrl(sheetId: string) {
  return `/api/admin/smartsheet/${sheetId}/export/xlsx`;
}

// ═══════ Templates (NEW) ═══════
export async function fetchTemplates() {
  const { data } = await adminHttp.get(`${BASE}/templates`);
  return (data.data as any[]).map(normalizeSheet);
}

export async function saveAsTemplate(sheetId: string) {
  await adminHttp.post(`${BASE}/template`, { sheetId: Number(sheetId) });
}

export async function createFromTemplate(templateId: string, name: string) {
  const { data } = await adminHttp.post(`${BASE}/sheet/from-template/${templateId}`, { name });
  return normalizeSheet(data.data);
}
