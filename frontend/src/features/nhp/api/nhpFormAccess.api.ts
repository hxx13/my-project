import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

export interface NhpFormAccess {
  projectId?: number;
  eventId?: number;
  formKey: string;
  locked: boolean;
  selfView: boolean;
  othersView: boolean;
  selfEdit: boolean;
  othersEdit: boolean;
}

export async function fetchNhpFormAccessList(): Promise<NhpFormAccess[]> {
  const res = await authHttp.get<Result<NhpFormAccess[]>>("/nhp/form-access");
  return res.data.data ?? [];
}

export async function fetchNhpFormAccess(formKey: string, projectId = 0, eventId = 0): Promise<NhpFormAccess> {
  const res = await authHttp.get<Result<NhpFormAccess>>(
    `/nhp/form-access/${encodeURIComponent(formKey)}?projectId=${projectId}&eventId=${eventId}`,
  );
  return res.data.data;
}

export async function setNhpFormAccess(
  formKey: string,
  body: Partial<Omit<NhpFormAccess, "formKey" | "projectId" | "eventId">>,
  projectId = 0,
  eventId = 0,
): Promise<void> {
  await authHttp.put(
    `/nhp/form-access/${encodeURIComponent(formKey)}?projectId=${projectId}&eventId=${eventId}`,
    body,
  );
}
