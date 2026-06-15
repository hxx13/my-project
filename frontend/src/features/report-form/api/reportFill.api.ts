// frontend/src/features/report-form/api/reportFill.api.ts
import { adminHttp } from '@/api/core/adminHttp';
import { authStorage } from '@/features/auth/authStorage';
import type { ReportFormDefinition, ReportFormSubmission } from '../types';
import toast from 'react-hot-toast';

const BASE = '/report-fill';

export function fetchAvailableForms(): Promise<ReportFormDefinition[]> {
  return adminHttp.get(`${BASE}/available`).then(({ data }) => data.data);
}

export function fetchCanEdit(formId: number): Promise<{ canEdit: boolean; role: string }> {
  return adminHttp.get(`${BASE}/forms/${formId}/can-edit`).then(({ data }) => data.data);
}

export function fetchMySubmission(formId: number): Promise<ReportFormSubmission> {
  return adminHttp.get(`${BASE}/forms/${formId}/my-submission`).then(({ data }) => data.data);
}

export function fetchFormSubmissions(formId: number): Promise<ReportFormSubmission[]> {
  return adminHttp.get(`${BASE}/forms/${formId}/submissions`).then(({ data }) => data.data);
}

export interface SavePayload {
  fieldValuesJson: string;
  expectedVersion: number;
}

export function saveMySubmission(formId: number, payload: SavePayload): Promise<ReportFormSubmission> {
  return adminHttp.put(`${BASE}/forms/${formId}/my-submission`, payload).then(({ data }) => data.data);
}

export function submitMySubmission(formId: number): Promise<ReportFormSubmission> {
  return adminHttp.post(`${BASE}/forms/${formId}/my-submission/submit`).then(({ data }) => data.data);
}

export function createFromTemplate(templateId: number): Promise<ReportFormDefinition> {
  return adminHttp.post(`/report-form/forms/from-template/${templateId}`).then(({ data }) => data.data);
}

// ──────────────── 导出 ────────────────

interface DownloadOptions {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  /** true = 新标签页预览（打印 PDF），false = 触发下载 */
  inline?: boolean;
  defaultFilename?: string;
}

/** 通过 fetch 下载二进制文件；若服务端返回 JSON 错误则解析 message 并抛出 */
async function downloadFile(path: string, options: DownloadOptions = {}) {
  const token = authStorage.getToken();
  const method = options.method ?? 'GET';
  const resp = await fetch(`/api/admin${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
  });

  const contentType = resp.headers.get('Content-Type') || '';

  if (!resp.ok || contentType.includes('application/json')) {
    let message = `导出失败 (${resp.status})`;
    if (contentType.includes('application/json')) {
      try {
        const json = await resp.json();
        message = json.message || json.msg || message;
      } catch {
        // ignore parse error
      }
    }
    throw new Error(message);
  }

  const blob = await resp.blob();
  const disposition = resp.headers.get('Content-Disposition') || '';
  const filenameMatch = /filename\*?=(?:UTF-8''|"?)([^";]+)/i.exec(disposition);
  const filename = filenameMatch?.[1]?.replace(/"/g, '') || options.defaultFilename || 'download';

  const blobUrl = URL.createObjectURL(blob);
  if (options.inline) {
    window.open(blobUrl, '_blank');
  } else {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

async function runExport(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    const msg = (e as Error).message || `${label}失败`;
    toast.error(msg);
    throw e;
  }
}

export async function exportExcel(formId: number, submissionId?: number) {
  await runExport('Excel 导出', () => downloadFile(
    submissionId
      ? `${BASE}/forms/${formId}/export?submissionId=${submissionId}`
      : `${BASE}/forms/${formId}/export`,
    { defaultFilename: `report-form-${formId}.xlsx` },
  ));
}

export async function exportPdf(formId: number, submissionId?: number) {
  await runExport('PDF 导出', () => downloadFile(
    submissionId
      ? `${BASE}/forms/${formId}/export-pdf?submissionId=${submissionId}`
      : `${BASE}/forms/${formId}/export-pdf`,
    { defaultFilename: `report-form-${formId}.pdf` },
  ));
}

export async function exportWord(formId: number, wtId: string, submissionId: number) {
  await runExport('Word 导出', () => downloadFile(
    `${BASE}/forms/${formId}/export-word/${wtId}?submissionId=${submissionId}`,
    { defaultFilename: `report-form-${formId}.docx` },
  ));
}

export async function printForm(formId: number, submissionId?: number) {
  await runExport('打印', () => downloadFile(
    `${BASE}/forms/${formId}/print`,
    {
      method: 'POST',
      body: submissionId != null ? { submissionId } : {},
      inline: true,
      defaultFilename: `report-form-${formId}.pdf`,
    },
  ));
}
