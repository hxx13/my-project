// frontend/src/features/report-form/api/reportFill.api.ts
import { adminHttp } from '@/api/core/adminHttp';
import type { ReportFormDefinition, ReportFormSubmission } from '../types';

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
