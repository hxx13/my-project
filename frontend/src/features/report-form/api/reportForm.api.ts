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

export function createBlankForm(): Promise<ReportFormDefinition> {
  return adminHttp.post(`${BASE}/forms/create-blank`).then(({ data }) => data.data);
}

export function createFormFromExcel(file: File): Promise<ReportFormDefinition> {
  const formData = new FormData();
  formData.append('file', file);
  return adminHttp.post(`${BASE}/forms/from-excel`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(({ data }) => data.data);
}

export function deleteForm(id: number): Promise<void> {
  return adminHttp.delete(`${BASE}/forms/${id}`);
}

export function batchDeleteForms(ids: number[]): Promise<void> {
  return adminHttp.post(`${BASE}/forms/batch-delete`, { ids });
}

export function renameForm(id: number, name: string): Promise<void> {
  return adminHttp.put(`${BASE}/forms/${id}/rename`, { name });
}

export function duplicateForm(id: number): Promise<ReportFormDefinition> {
  return adminHttp.post(`${BASE}/forms/${id}/duplicate`).then(({ data }) => data.data);
}

export function publishForm(id: number): Promise<ReportFormDefinition> {
  return adminHttp.post(`${BASE}/forms/${id}/publish`).then(({ data }) => data.data);
}

export function unpublishForm(id: number): Promise<void> {
  return adminHttp.post(`${BASE}/forms/${id}/unpublish`);
}

export function saveAsTemplate(id: number, shared?: boolean): Promise<ReportFormDefinition> {
  return adminHttp.post(`${BASE}/forms/${id}/save-as-template`, { shared }).then(({ data }) => data.data);
}

export function fetchTemplates(): Promise<ReportFormDefinition[]> {
  return adminHttp.get(`${BASE}/templates`).then(({ data }) => data.data);
}

export function fetchVersions(id: number): Promise<unknown[]> {
  return adminHttp.get(`${BASE}/forms/${id}/versions`).then(({ data }) => data.data);
}
