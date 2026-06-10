// frontend/src/api/domains/smartsheet.api.ts
import axios from 'axios';
import type {
  SmartSheetDefinition,
  SmartSheetRow,
  SmartSheetCreateRequest,
  SmartSheetUpdateRequest,
  SmartSheetRowUpdateRequest,
  ColumnStats,
} from '@/features/smartsheet/types';

const BASE = '/api/admin/smartsheet';

// Sheet CRUD
export async function fetchSheetPage(page = 1, pageSize = 20) {
  const { data } = await axios.get(`${BASE}/sheet/page`, { params: { page, pageSize } });
  return data.data as { list: SmartSheetDefinition[]; total: number };
}

export async function createSheet(req: SmartSheetCreateRequest) {
  const { data } = await axios.post(`${BASE}/sheet`, req);
  return data.data as SmartSheetDefinition;
}

export async function getSheet(id: string) {
  const { data } = await axios.get(`${BASE}/sheet/${id}`);
  return data.data as SmartSheetDefinition;
}

export async function updateSheet(id: string, req: SmartSheetUpdateRequest) {
  const { data } = await axios.put(`${BASE}/sheet/${id}`, req);
  return data.data as SmartSheetDefinition;
}

export async function deleteSheet(id: string) {
  await axios.delete(`${BASE}/sheet/${id}`);
}

// Row CRUD
export async function fetchRows(sheetId: string) {
  const { data } = await axios.get(`${BASE}/${sheetId}/rows`);
  return data.data as SmartSheetRow[];
}

export async function addRow(sheetId: string, rowLabel = '', rowEntityId?: string) {
  const { data } = await axios.post(`${BASE}/${sheetId}/row`, { rowLabel, rowEntityId });
  return data.data as SmartSheetRow;
}

export async function updateRow(sheetId: string, rowId: string, req: SmartSheetRowUpdateRequest) {
  const { data } = await axios.put(`${BASE}/${sheetId}/row/${rowId}`, req);
  return data.data as SmartSheetRow;
}

export async function deleteRow(sheetId: string, rowId: string) {
  await axios.delete(`${BASE}/${sheetId}/row/${rowId}`);
}

export async function batchRows(sheetId: string, rows: { rowLabel: string; cellData: Record<string, string> }[]) {
  const { data } = await axios.post(`${BASE}/${sheetId}/rows/batch`, rows);
  return data.data as { inserted: number };
}

// Export / Import
export function getExportUrl(sheetId: string) {
  return `${BASE}/${sheetId}/export`;
}

export async function importFile(sheetId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await axios.post(`${BASE}/${sheetId}/import`, form);
  return data.data;
}

// Stats
export async function fetchColumnStats(sheetId: string, columnKey: string) {
  const { data } = await axios.get(`${BASE}/${sheetId}/stats`, { params: { columnKey } });
  return data.data as ColumnStats;
}
