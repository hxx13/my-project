// frontend/src/features/report-form/api/reportFill.api.ts
import { adminHttp } from '@/api/core/adminHttp';
import type { ReportFormDefinition } from '../types';

const BASE = '/report-fill';

export function fetchAvailableForms(): Promise<ReportFormDefinition[]> {
  return adminHttp.get(`${BASE}/available`).then(({ data }) => data.data);
}
