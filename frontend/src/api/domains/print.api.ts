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

export type PrintJobStatus = "PENDING" | "SENT" | "PRINTED" | "FAILED" | "CANCELLED";

export interface PrintJob {
  id: string;
  stationId: string;
  sourceType: string;
  sourceId: string;
  fileName: string;
  copies: number;
  /** 派发时写的备注 */
  note: string | null;
  /** 越大越先被领走；10 = 加急 */
  priority: number;
  status: PrintJobStatus;
  attempts: number;
  lastError: string | null;
  /** 派发人的 user.id */
  createdBy: string | null;
  createdAt: string;
  sentAt: string | null;
  printedAt: string | null;
}

/** 加急优先级，与后端 PrintJob.PRIORITY_URGENT 对齐 */
export const PRINT_PRIORITY_URGENT = 10;

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
  /** 派发备注，随任务带到工位页 */
  note?: string;
  /** 加急：排到同级前面 */
  urgent?: boolean;
}): Promise<PrintJob | undefined> {
  const res = await authHttp.post<Result<PrintJob>>("/admin/print/jobs", body);
  return res.data.data;
}

/* ────────────── 队列与历史 ────────────── */

/** 队列：还没结束的任务（排队中 / 已派给工位 / 失败待处理）。 */
export async function fetchPrintQueue(stationId?: string, limit = 100): Promise<PrintJob[]> {
  const res = await authHttp.get<Result<PrintJob[]>>("/admin/print/jobs/queue", {
    params: { stationId: stationId || undefined, limit },
  });
  return res.data.data ?? [];
}

/** 历史：全部状态。status 传逗号分隔的多值（如 "PRINTED,FAILED"）。 */
export async function fetchPrintHistory(
  stationId?: string,
  status?: string,
  limit = 200,
): Promise<PrintJob[]> {
  const res = await authHttp.get<Result<PrintJob[]>>("/admin/print/jobs/history", {
    params: { stationId: stationId || undefined, status: status || undefined, limit },
  });
  return res.data.data ?? [];
}

/** 撤回。只有还没被工位领走的能撤；已派出的会返回业务错误。 */
export async function cancelPrintJob(id: string): Promise<void> {
  await authHttp.post(`/admin/print/jobs/${id}/cancel`);
}

/** 重推失败任务。 */
export async function retryPrintJob(id: string): Promise<void> {
  await authHttp.post(`/admin/print/jobs/${id}/retry`);
}

/** 本工位还排着几条（工位页用）。 */
export async function fetchPendingCount(): Promise<number> {
  const res = await authHttp.get<Result<{ pending: number }>>("/print/pending-count");
  return res.data.data?.pending ?? 0;
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
