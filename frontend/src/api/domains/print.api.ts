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
  /**
   * 执行方式。SERVER 才有「服务端打印队列」可清。
   * 老版本接口没有这个字段 —— 取不到时按「非直发」处理，宁可不给入口也别给错。
   */
  mode?: "KIOSK" | "SERVER";
  /** 支持的文件类型分组，逗号分隔；null/空 = 全支持 */
  supportedTypes: string | null;
  /** 在线的三态。UNKNOWN 是「从没连过」，跟 OFFLINE 不是一回事 */
  liveStatus: "ONLINE" | "OFFLINE" | "UNKNOWN";
  /** 服务端生成好的可读原因，直接展示，不要在前端重算 */
  liveStatusReason?: string;
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
  /** 派发人显示名，**由服务端解析好**再返回（前端不碰裸 id） */
  createdByName: string;
  createdAt: string;
  sentAt: string | null;
  printedAt: string | null;
  /**
   * 「还排在打印机队列里吗」独立于 status 的一维：
   * QUEUED = 此刻确实还排在队列里 / CLEARED = 已不在 / null = 没核对过、不适用。
   * 直发任务可能 status 已是 PRINTED（lp 退出码 0）而纸还在队列里排着。
   */
  queueState: "QUEUED" | "CLEARED" | null;
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

/**
 * 派发前的预览：返回**实际会被打印的那份**。
 *
 * 跟「文件模板」的下载不是一回事 —— 那个给用户上传的原文件（.docx），
 * 这个给转换后的 PDF。预览必须跟出纸一致，否则看了也白看。
 */
export async function fetchPrintPreview(
  sourceType: "CARD_ARCHIVE" | "ADMIN_FILE",
  sourceId: string,
): Promise<Blob> {
  const res = await authHttp.get("/admin/print/preview", {
    params: { sourceType, sourceId },
    responseType: "blob",
    timeout: 60000,
  });
  return res.data as Blob;
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

/**
 * 工位执行方式，与后端 PrintStation.MODE_* 对齐。
 *
 * KIOSK  = 工位电脑开着工位页，浏览器渲染后走那台机器的默认打印机。
 * SERVER = 后端直发，把 PDF 交给后端所在机器的打印队列（生产上是 CUPS 的 lp）。
 *          只给「所在网段没有常开电脑可挂工位页」的打印机用。
 */
export type PrintStationMode = "KIOSK" | "SERVER";

export interface AdminPrintStation {
  id: string;
  name: string;
  /** 执行方式。 */
  mode: PrintStationMode;
  /** 该工位绑定的「打印者账号」—— sys_user.id，形如 STAFF_xxx。直发工位为 null */
  userId: string | null;
  /** 服务端补的显示名。老版本接口没有这个字段，取不到时退回 userId */
  userDisplayName?: string;
  /** 打印页 @page size，如 "85.6mm 54mm"；null = 用驱动默认 */
  pageSize: string | null;
  /** 支持的文件类型分组，逗号分隔；null/空 = 全支持 */
  supportedTypes: string | null;
  /** 打印机 IP。KIOSK 是纯记录；**SERVER 是投递目标**（生产上 CUPS 队列名就用它） */
  printerIp: string | null;
  enabled: boolean;
  createdAt?: string;
  /** 在线的三态。UNKNOWN 是「从没连过」，跟 OFFLINE 不是一回事 */
  liveStatus: "ONLINE" | "OFFLINE" | "UNKNOWN";
  /** 服务端生成好的可读原因，直接展示，不要在前端重算 */
  liveStatusReason?: string;
}

export async function fetchPrintStations(): Promise<AdminPrintStation[]> {
  const res = await authHttp.get<Result<AdminPrintStation[]>>("/admin/print/stations");
  return res.data.data ?? [];
}

export async function savePrintStation(body: {
  id?: string;
  name: string;
  mode: PrintStationMode;
  /** 直发工位没有账号，传 null */
  userId: string | null;
  pageSize: string | null;
  /** 逗号分隔的类型分组；null = 全支持 */
  supportedTypes: string | null;
  /** KIOSK 是纯记录；SERVER 是投递目标，必填 */
  printerIp: string | null;
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

/**
 * 让该工位的页面刷新。
 * 部署或改完配置后远程重启工位页，不用跑到机器前按 F5 —— 工位机通常无人值守。
 */
export async function reloadPrintStation(id: string): Promise<void> {
  await authHttp.post(`/admin/print/stations/${id}/reload`);
}

/* ────────────── 直发队列：能力与清空 ────────────── */

/**
 * 当前账号能做什么。清队列要 ADMIN，但队列弹窗挂在教职工可见的页面上，
 * 所以按钮显隐问服务端，不在前端复制一份角色规则。
 */
export async function fetchPrintCapabilities(): Promise<{ canClearQueue: boolean }> {
  const res = await authHttp.get<Result<{ canClearQueue: boolean }>>("/admin/print/capabilities");
  return res.data.data;
}

/** 清空这台打印机的队列。返回 CUPS 清掉几条 / 库里收起几条。 */
export async function clearStationQueue(
  stationId: string,
): Promise<{ cleared: number; cancelled: number }> {
  const res = await authHttp.post<Result<{ cleared: number; cancelled: number }>>(
    `/admin/print/stations/${stationId}/queue/clear`,
  );
  return res.data.data;
}
