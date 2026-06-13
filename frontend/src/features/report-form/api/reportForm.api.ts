// frontend/src/features/report-form/api/reportForm.api.ts
import { adminHttp } from '@/api/core/adminHttp';
import type { ReportFormDefinition, PageResult } from '../types';

const BASE = '/report-form';

export function fetchFormPage(page = 1, size = 100): Promise<PageResult<ReportFormDefinition>> {
  return adminHttp.get(`${BASE}/forms/page`, { params: { page, size } }).then(({ data }) => data.data);
}

export function fetchFormById(id: number): Promise<ReportFormDefinition> {
  return adminHttp.get(`${BASE}/forms/${id}`).then(({ data }) => {
    console.warn('%c🔵 [REPORT-FORM-API] fetchFormById id=%c' + id,
      'font-size:14px;color:blue;font-weight:bold', '');
    console.warn('%c🔵 [REPORT-FORM-API] fetchFormById 响应 raw=%c', '', '', data);
    const form = data.data as Record<string, unknown>;
    console.warn('%c🔵 [REPORT-FORM-API] fetchFormById form.layoutJson typeof=%c' + typeof form?.layoutJson,
      'font-size:14px;color:blue', '');
    return data.data;
  });
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
  console.warn('%c🔴 [REPORT-FORM-API] 开始上传 Excel%c',
    'font-size:16px;color:red;font-weight:bold', '',
    file.name, file.size, 'bytes');
  return adminHttp.post(`${BASE}/forms/from-excel`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(({ data }) => {
    console.warn('%c🔴 [REPORT-FORM-API] 上传响应%c', 'font-size:16px;color:red;font-weight:bold', '', data);
    const form = data.data as Record<string, unknown>;
    console.warn('%c🔴 [REPORT-FORM-API] form.id=%c' + form?.id,
      'font-size:14px;color:red', '');
    console.warn('%c🔴 [REPORT-FORM-API] form.layoutJson 类型=%c' + typeof form?.layoutJson,
      'font-size:14px;color:red', '');
    if (typeof form?.layoutJson === 'string') {
      console.warn('%c🔴 [REPORT-FORM-API] form.layoutJson 长度=%c' + (form.layoutJson as string).length,
        'font-size:14px;color:red', '');
      console.warn('%c🔴 [REPORT-FORM-API] form.layoutJson 前300字符=%c' + (form.layoutJson as string).substring(0, 300),
        'font-size:14px;color:red', '');
    } else {
      console.warn('%c🔴 [REPORT-FORM-API] ⚠️ layoutJson 不是字符串! typeof=' + typeof form?.layoutJson,
        'font-size:16px;color:red;font-weight:bold');
    }
    return data.data;
  }).catch(e => {
    console.warn('%c🔴 [REPORT-FORM-API] 上传失败%c', 'font-size:16px;color:red;font-weight:bold', '', e);
    throw e;
  });
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
