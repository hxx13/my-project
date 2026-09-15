import { authHttp } from "@/api/core/authHttp";

/** 与 cardPrint.api.ts 一致：Result 在各 api 文件内本地声明 */
interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface PrintStationOption {
  id: string;
  name: string;
}

export type PrintJobStatus = "PENDING" | "SENT" | "PRINTED" | "FAILED";

export interface PrintJob {
  id: string;
  stationId: string;
  sourceType: string;
  sourceId: string;
  fileName: string;
  copies: number;
  status: PrintJobStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  printedAt: string | null;
}

export interface MyStation {
  id: string;
  name: string;
  /** 打印页 @page size，如 "85.6mm 54mm"；null = 用驱动默认 */
  pageSize: string | null;
}

/** 普通人员选打印机用，只返回已启用的工位。 */
export async function fetchSelectableStations(): Promise<PrintStationOption[]> {
  const res = await authHttp.get<Result<PrintStationOption[]>>("/print/stations");
  return res.data.data ?? [];
}

/** 工位页取自身配置。非工位账号会因 success:false 被 authHttp 拒绝。 */
export async function fetchMyStation(): Promise<MyStation> {
  const res = await authHttp.get<Result<MyStation>>("/print/me");
  return res.data.data;
}

/** 原子领一条任务。没有可领的返回 null。 */
export async function claimPrintJob(): Promise<PrintJob | null> {
  const res = await authHttp.post<Result<PrintJob | null>>("/print/jobs/claim");
  return res.data.data ?? null;
}

export async function ackPrintJob(id: string, ok: boolean, error?: string): Promise<void> {
  await authHttp.post(`/print/jobs/${id}/ack`, { ok, error: error ?? null });
}

export async function fetchMyPrintJobs(limit = 20): Promise<PrintJob[]> {
  const res = await authHttp.get<Result<PrintJob[]>>("/print/my-jobs", { params: { limit } });
  return res.data.data ?? [];
}

/** 取任务文件字节。工位账号只能取自己工位的任务，越权由服务端 403。 */
export async function fetchPrintJobFile(id: string): Promise<Blob> {
  const res = await authHttp.get(`/print/jobs/${id}/file`, { responseType: "blob" });
  return res.data as Blob;
}

/** 建打印任务（管理端）。选好工位后由触发入口调用。 */
export async function createPrintJob(body: {
  stationId: string;
  sourceType: "CARD_ARCHIVE" | "ADMIN_FILE";
  sourceId: string;
  fileName: string;
  copies?: number;
}): Promise<PrintJob | undefined> {
  const res = await authHttp.post<Result<PrintJob>>("/admin/print/jobs", body);
  return res.data.data;
}

/* ────────────── 管理端：工位 ────────────── */

export interface AdminPrintStation {
  id: string;
  name: string;
  /** 该工位绑定的「打印者账号」—— sys_user.id，形如 STAFF_xxx */
  userId: string;
  /** 服务端补的显示名。老版本接口没有这个字段，取不到时退回 userId */
  userDisplayName?: string;
  /** 打印页 @page size，如 "85.6mm 54mm"；null = 用驱动默认 */
  pageSize: string | null;
  enabled: boolean;
  createdAt?: string;
}

export async function fetchPrintStations(): Promise<AdminPrintStation[]> {
  const res = await authHttp.get<Result<AdminPrintStation[]>>("/admin/print/stations");
  return res.data.data ?? [];
}

export async function savePrintStation(body: {
  id?: string;
  name: string;
  userId: string;
  pageSize: string | null;
  enabled: boolean;
}): Promise<AdminPrintStation | undefined> {
  if (body.id) {
    const res = await authHttp.put<Result<AdminPrintStation>>(
      `/admin/print/stations/${body.id}`,
      body,
    );
    return res.data.data;
  }
  const res = await authHttp.post<Result<AdminPrintStation>>("/admin/print/stations", body);
  return res.data.data;
}

export async function deletePrintStation(id: string): Promise<void> {
  await authHttp.delete(`/admin/print/stations/${id}`);
}
