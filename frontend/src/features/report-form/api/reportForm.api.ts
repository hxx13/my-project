// frontend/src/features/report-form/api/reportForm.api.ts
import { adminHttp } from '@/api/core/adminHttp';
import type { ReportFormDefinition, PageResult } from '../types';

const BASE = '/report-form';

export function fetchFormPage(page = 1, size = 100): Promise<PageResult<ReportFormDefinition>> {
  return adminHttp.get(`${BASE}/forms/page`, { params: { page, size } }).then(({ data }) => data.data);
}

export function fetchFormById(id: number): Promise<ReportFormDefinition> {
  return adminHttp.get(`${BASE}/forms/${id}`).then(({ data }) => data.data);
}

export function updateForm(id: number, data: Record<string, unknown>): Promise<void> {
  return adminHttp.put(`${BASE}/forms/${id}`, data);
}

export function createFormFromExcel(file: File): Promise<ReportFormDefinition> {
  const formData = new FormData();
  formData.append('file', file);
  return adminHttp.post(`${BASE}/forms/from-excel`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(({ data }) => data.data);
}
