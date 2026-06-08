import { adminHttp } from "@/api/core/adminHttp";

export interface ViolationTextTemplateRow {
  id: number;
  name: string;
  violationText: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export async function listViolationTextTemplates(): Promise<ViolationTextTemplateRow[]> {
  const res = await adminHttp.get<Result<ViolationTextTemplateRow[]>>("/twin/student-violations/text-templates");
  return (res.data as any)?.data ?? [];
}

export async function createViolationTextTemplate(
  name: string,
  violationText: string,
  sortOrder = 0
): Promise<ViolationTextTemplateRow> {
  const res = await adminHttp.post<Result<ViolationTextTemplateRow>>(
    "/twin/student-violations/text-templates",
    { name, violationText, sortOrder }
  );
  return (res.data as any)?.data as ViolationTextTemplateRow;
}

export async function updateViolationTextTemplate(
  id: number,
  body: { name?: string; violationText?: string; sortOrder?: number }
): Promise<ViolationTextTemplateRow> {
  const res = await adminHttp.put<Result<ViolationTextTemplateRow>>(
    `/twin/student-violations/text-templates/${id}`,
    body
  );
  return (res.data as any)?.data as ViolationTextTemplateRow;
}

export async function deleteViolationTextTemplate(id: number): Promise<void> {
  await adminHttp.delete(`/twin/student-violations/text-templates/${id}`);
}
