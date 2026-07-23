// frontend/src/features/report-form/api/reportFill.api.ts
import { adminHttp } from '@/api/core/adminHttp';
import { authStorage } from '@/features/auth/authStorage';
import type { ReportFormDefinition, ReportFormSubmission, PublisherFillGroup } from '../types';
import { parseContentDispositionFilename } from '../utils/reportFormExportFilename';
import toast from 'react-hot-toast';

const BASE = '/report-fill';

export function fetchAvailableForms(): Promise<ReportFormDefinition[]> {
  return adminHttp.get(`${BASE}/available`).then(({ data }) => data.data);
}

export function fetchCanEdit(formId: number, submissionId?: number): Promise<{ canEdit: boolean; role: string; publisher?: boolean }> {
  const qs = submissionId != null ? `?submissionId=${submissionId}` : '';
  return adminHttp.get(`${BASE}/forms/${formId}/can-edit${qs}`).then(({ data }) => data.data);
}

export function fetchMySubmission(formId: number, submissionId?: number): Promise<ReportFormSubmission> {
  const qs = submissionId != null ? `?submissionId=${submissionId}` : '';
  return adminHttp.get(`${BASE}/forms/${formId}/my-submission${qs}`).then(({ data }) => data.data);
}

export function fetchMySubmissions(formId: number): Promise<ReportFormSubmission[]> {
  return adminHttp.get(`${BASE}/forms/${formId}/my-submissions`).then(({ data }) => data.data);
}

export function createSubmissionInstance(formId: number, instanceLabel?: string): Promise<ReportFormSubmission> {
  return adminHttp.post(`${BASE}/forms/${formId}/instances`, { instanceLabel }).then(({ data }) => data.data);
}

export function deleteSubmissionInstance(formId: number, submissionId: number): Promise<void> {
  return adminHttp.delete(`${BASE}/forms/${formId}/submissions/${submissionId}`).then(({ data }) => data.data);
}

export function fetchPublisherOverview(formId: number): Promise<PublisherFillGroup[]> {
  return adminHttp.get(`${BASE}/forms/${formId}/publisher-overview`).then(({ data }) => data.data);
}

export function fetchFormSubmissions(formId: number): Promise<ReportFormSubmission[]> {
  return adminHttp.get(`${BASE}/forms/${formId}/submissions`).then(({ data }) => data.data);
}

export interface SavePayload {
  submissionId?: number;
  fieldValuesJson: string;
  expectedVersion: number;
}

export function saveMySubmission(formId: number, payload: SavePayload): Promise<ReportFormSubmission> {
  return adminHttp.put(`${BASE}/forms/${formId}/my-submission`, payload).then(({ data }) => data.data);
}

export function submitMySubmission(formId: number, submissionId?: number): Promise<ReportFormSubmission> {
  const qs = submissionId != null ? `?submissionId=${submissionId}` : '';
  return adminHttp.post(`${BASE}/forms/${formId}/my-submission/submit${qs}`).then(({ data }) => data.data);
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
  const filename = parseContentDispositionFilename(disposition)
    || options.defaultFilename
    || 'download';

  const blobUrl = URL.createObjectURL(blob);
  if (options.inline) {
    const win = window.open(blobUrl, '_blank');
    if (win) {
      const triggerPrint = () => {
        try {
          win.print();
        } catch {
          // 部分浏览器对 blob: 预览页限制 print()
        }
      };
      win.addEventListener('load', triggerPrint);
      window.setTimeout(triggerPrint, 900);
    }
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

export async function exportExcel(formId: number, submissionId?: number, defaultFilename?: string) {
  await runExport('Excel 导出', () => downloadFile(
    submissionId
      ? `${BASE}/forms/${formId}/export?submissionId=${submissionId}`
      : `${BASE}/forms/${formId}/export`,
    { defaultFilename },
  ));
}

export async function exportPdf(formId: number, submissionId?: number, defaultFilename?: string) {
  await runExport('PDF 导出', () => downloadFile(
    submissionId
      ? `${BASE}/forms/${formId}/export-pdf?submissionId=${submissionId}`
      : `${BASE}/forms/${formId}/export-pdf`,
    { defaultFilename },
  ));
}

export async function exportWord(
  formId: number,
  wtId: string,
  submissionId: number,
  fieldValues?: Record<string, unknown>,
  defaultFilename?: string,
) {
  await runExport('Word 导出', () => downloadFile(
    `${BASE}/forms/${formId}/export-word/${wtId}`,
    {
      method: 'POST',
      body: {
        submissionId,
        ...(fieldValues && Object.keys(fieldValues).length > 0
          ? { fieldValuesJson: JSON.stringify(fieldValues) }
          : {}),
      },
      defaultFilename,
    },
  ));
}

export async function printForm(formId: number, submissionId?: number, defaultFilename?: string) {
  await runExport('打印', () => downloadFile(
    `${BASE}/forms/${formId}/print`,
    {
      method: 'POST',
      body: submissionId != null ? { submissionId } : {},
      inline: true,
      defaultFilename,
    },
  ));
}
