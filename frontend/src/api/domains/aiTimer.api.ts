import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

/** 一条计时器（服务端形状，见 AiTimerController#view）。 */
export interface AiTimerRow {
  id: number;
  label?: string;
  toolName: string;
  argsJson?: string;
  status: string;
  statusZh: string;
  ownerUserId?: string;
  ownerName?: string;
  ownerRole?: string;
  /** 给人看的绝对时刻串（服务器时区），**别拿它算倒计时**。 */
  fireAt?: string;
  /** 倒计时的锚：绝对毫秒。 */
  fireAtMillis?: number;
  createdAt?: string;
  createdAtMillis?: number;
  firedAt?: string;
  cancelledAt?: string;
  confirmedBy?: string;
  ok?: boolean | number | null;
  result?: string;
  error?: string;
  sessionId?: number;
}

export interface AiTimerList {
  /** 服务端此刻的绝对毫秒 —— 用它修本地时钟差，倒计时才准。 */
  serverNowMillis: number;
  serverNow: string;
  scope: string;
  openCount: number;
  list: AiTimerRow[];
}

/**
 * 计时器列表。
 *
 * 返回体里带上 **clientAt**（拿到响应的本地时刻）：页面上算倒计时要用
 * `serverNowMillis - clientAt` 这个偏移量，服务端时间与本地时间差多少就补多少。
 * 不这么干，机器时钟快/慢几分钟就会显示成「已经到点了但没执行」。
 */
export async function fetchAiTimers(params?: {
  scope?: "mine" | "all";
  status?: string;
  owner?: string;
}): Promise<AiTimerList & { clientAt: number }> {
  const res = await authHttp.get<Result<AiTimerList>>("/v1/ai/timers", { params });
  return { ...res.data.data, clientAt: Date.now() };
}

/** 后面几个写操作都返回完整 Result —— 业务失败是 HTTP 200 + success:false，**必须看 success**。 */
export async function cancelAiTimer(id: number) {
  const res = await authHttp.post<Result<unknown>>(`/v1/ai/timers/${id}/cancel`);
  return res.data;
}

export async function cancelAllAiTimers() {
  const res = await authHttp.post<Result<number>>("/v1/ai/timers/cancel-all");
  return res.data;
}

export async function confirmAiTimer(id: number) {
  const res = await authHttp.post<Result<AiTimerRow>>(`/v1/ai/timers/${id}/confirm`);
  return res.data;
}

export async function skipAiTimer(id: number) {
  const res = await authHttp.post<Result<AiTimerRow>>(`/v1/ai/timers/${id}/skip`);
  return res.data;
}
