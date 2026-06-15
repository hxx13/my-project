// frontend/src/features/report-form/api/reportForm.api.ts
import { adminHttp } from '@/api/core/adminHttp';
import type { ReportFormDefinition, PageResult, OptionSet, WordTemplateBinding } from '../types';

const BASE = '/report-form';

export function fetchFormPage(page = 1, size = 100): Promise<ReportFormDefinition[]> {
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

export function togglePin(id: number): Promise<void> {
  return adminHttp.post(`${BASE}/forms/${id}/pin`);
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
  return adminHttp.get(`${BASE}/forms/${id}/versions`).then(({ data }) => {
    const raw = data.data;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    return [];
  });
}

export function archiveForm(id: number): Promise<void> {
  return adminHttp.post(`${BASE}/forms/${id}/archive`);
}

export function unarchiveForm(id: number): Promise<void> {
  return adminHttp.post(`${BASE}/forms/${id}/unarchive`);
}

export function togglePinForm(id: number): Promise<void> {
  return adminHttp.post(`${BASE}/forms/${id}/toggle-pin`);
}

// ── 选项集 ──

export function fetchOptionSets(): Promise<OptionSet[]> {
  return adminHttp.get(`${BASE}/option-sets`).then(({ data }) => data.data);
}

export function createOptionSet(name: string, itemsJson: string, scope = 'global', formId?: number) {
  return adminHttp.post(`${BASE}/option-sets`, { name, itemsJson, scope, formId }).then(({ data }) => data.data);
}

export function updateOptionSet(id: number, name: string, itemsJson: string) {
  return adminHttp.put(`${BASE}/option-sets/${id}`, { name, itemsJson }).then(({ data }) => data.data);
}

export function deleteOptionSet(id: number): Promise<void> {
  return adminHttp.delete(`${BASE}/option-sets/${id}`);
}

// ── Word 模板 ──

export function fetchWordTemplates(formId: number): Promise<WordTemplateBinding[]> {
  return adminHttp.get(`${BASE}/forms/${formId}/word-templates`).then(({ data }) => {
    const raw = data.data;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return []; }
    }
    if (Array.isArray(raw)) return raw;
    return [];
  });
}

export function uploadWordTemplate(formId: number, file: File, name?: string) {
  const fd = new FormData();
  fd.append('file', file);
  if (name) fd.append('name', name);
  return adminHttp.post(`${BASE}/forms/${formId}/word-templates`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(({ data }) => data.data);
}

export function unbindWordTemplate(formId: number, wtId: string): Promise<void> {
  return adminHttp.delete(`${BASE}/forms/${formId}/word-templates/${wtId}`);
}

export function createFormFromWord(file: File): Promise<ReportFormDefinition> {
  const fd = new FormData();
  fd.append('file', file);
  return adminHttp.post(`${BASE}/forms/from-word`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(({ data }) => data.data);
}
