// frontend/src/features/report-form/api/reportFill.api.ts
import { adminHttp } from '@/api/core/adminHttp';
import { authStorage } from '@/features/auth/authStorage';
import type { ReportFormDefinition, ReportFormSubmission } from '../types';
import toast from 'react-hot-toast';

const BASE = '/report-fill';

export function fetchAvailableForms(): Promise<ReportFormDefinition[]> {
  return adminHttp.get(`${BASE}/available`).then(({ data }) => data.data);
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

/** 通用文件下载：发起 blob 请求并触发浏览器下载 */
async function downloadBlob(url: string, filename: string) {
  const token = authStorage.getToken();
  const resp = await fetch(`/api/admin${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`下载失败 (${resp.status})`);
  const blob = await resp.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function exportExcel(formId: number, submissionId?: number) {
  const url = submissionId
    ? `${BASE}/forms/${formId}/export?submissionId=${submissionId}`
    : `${BASE}/forms/${formId}/export`;
  const filename = submissionId
    ? `report-${formId}-submission-${submissionId}.xlsx`
    : `report-${formId}-batch.xlsx`;
  await downloadBlob(url, filename);
  toast.success('Excel 导出完成');
}

export async function exportPdf(formId: number, submissionId?: number) {
  const url = submissionId
    ? `${BASE}/forms/${formId}/export-pdf?submissionId=${submissionId}`
    : `${BASE}/forms/${formId}/export-pdf`;
  const filename = submissionId
    ? `report-${formId}-submission-${submissionId}.pdf`
    : `report-${formId}-batch.pdf`;
  await downloadBlob(url, filename);
  toast.success('PDF 导出完成');
}

export async function exportWord(formId: number, wtId: string, submissionId: number) {
  const url = `${BASE}/forms/${formId}/export-word/${wtId}?submissionId=${submissionId}`;
  await downloadBlob(url, `report-${formId}-word.docx`);
  toast.success('Word 导出完成');
}

export async function printForm(formId: number, submissionId?: number) {
  const params = submissionId ? { submissionId } : {};
  await adminHttp.post(`${BASE}/forms/${formId}/print`, params);
  toast.success('打印任务已提交');
}
