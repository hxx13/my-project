import { adminHttp } from "@/api/core/adminHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface DoorSwipeRuleRow {
  id: number;
  name: string;
  enabled: boolean;
  channelCodes: string | null;
  scopeType: string | null;
  scopeValues: string | null;
  thresholdCount: number;
  thresholdWindowSec: number;
  stayOpenDurationSec: number;
  cooldownSec: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface DoorSwipeRuleUpsert {
  name: string;
  enabled: boolean;
  channelCodes: string | null;
  scopeType: string | null;
  scopeValues: string | null;
  thresholdCount: number;
  thresholdWindowSec: number;
  stayOpenDurationSec: number;
  cooldownSec: number;
}

export interface DoorSwipeRuleChannelRow {
  channelCode: string;
  channelName: string;
  enabled: boolean;
}

export interface DoorSwipeRuleRecordRow {
  id: number;
  recordId: string;
  cardNumber: string;
  channelCode: string;
  channelName: string;
  openType: number;
  personCode: string;
  personName: string;
  departmentId: string;
  swingTime: string;
  openResult: string;
  enterOrExit: number;
  createTime: string;
}

export interface DoorSwipeRuleOperationLogRow {
  id: number;
  automationType: string;
  eventKey: string;
  triggerType: string;
  triggerReason: string;
  userId: string;
  targetId: string;
  success: number;
  detail: string;
  eventTime: string;
  createdBy: string;
  /** 后端 label 展开字段（channelName / roomName / userName / detailDisplay 等） */
  [key: string]: unknown;
}

export interface PagedResult<T> {
  list: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

export interface DoorSwipeRecordQuery {
  channelCode?: string;
  /** 后端 @RequestParam 名是 person（原先发 personName 会被 Spring 静默忽略，姓名筛选形同不存在） */
  person?: string;
  openType?: number;
  startTime?: string;
  endTime?: string;
  page?: number;
  /** 后端 @RequestParam 名是 pageSize（原先发 size 同样被忽略，页大小恒为默认 20） */
  pageSize?: number;
}

export async function listDoorSwipeRules(): Promise<DoorSwipeRuleRow[]> {
  const res = await adminHttp.get<Result<DoorSwipeRuleRow[]>>("/door-swipe-rule/rules");
  return res.data?.data ?? [];
}

export async function createDoorSwipeRule(body: DoorSwipeRuleUpsert): Promise<DoorSwipeRuleRow> {
  const res = await adminHttp.post<Result<DoorSwipeRuleRow>>("/door-swipe-rule/rules", body);
  return res.data?.data as DoorSwipeRuleRow;
}

export async function updateDoorSwipeRule(id: number, body: DoorSwipeRuleUpsert): Promise<DoorSwipeRuleRow> {
  const res = await adminHttp.put<Result<DoorSwipeRuleRow>>(`/door-swipe-rule/rules/${id}`, body);
  return res.data?.data as DoorSwipeRuleRow;
}

export async function deleteDoorSwipeRule(id: number): Promise<void> {
  await adminHttp.delete(`/door-swipe-rule/rules/${id}`);
}

export async function toggleDoorSwipeRule(id: number): Promise<DoorSwipeRuleRow> {
  const res = await adminHttp.patch<Result<DoorSwipeRuleRow>>(`/door-swipe-rule/rules/${id}/toggle`);
  return res.data?.data as DoorSwipeRuleRow;
}

export async function listDoorSwipeChannels(): Promise<DoorSwipeRuleChannelRow[]> {
  const res = await adminHttp.get<Result<DoorSwipeRuleChannelRow[]>>("/door-swipe-rule/channels");
  return res.data?.data ?? [];
}

export async function replaceDoorSwipeChannels(
  body: { channelCode: string; channelName: string }[],
): Promise<DoorSwipeRuleChannelRow[]> {
  const res = await adminHttp.put<Result<DoorSwipeRuleChannelRow[]>>("/door-swipe-rule/channels/replace", body);
  return res.data?.data ?? [];
}

export async function toggleDoorSwipeChannel(code: string): Promise<DoorSwipeRuleChannelRow> {
  const res = await adminHttp.patch<Result<DoorSwipeRuleChannelRow>>(
    `/door-swipe-rule/channels/${encodeURIComponent(code)}/toggle`,
  );
  return res.data?.data as DoorSwipeRuleChannelRow;
}

export async function listDoorSwipeRecords(
  params: DoorSwipeRecordQuery = {},
): Promise<PagedResult<DoorSwipeRuleRecordRow>> {
  const res = await adminHttp.get<Result<PagedResult<DoorSwipeRuleRecordRow>>>("/door-swipe-rule/records", {
    params,
  });
  const data = res.data?.data;
  return { list: data?.list ?? [], total: data?.total ?? 0, page: data?.page, pageSize: data?.pageSize };
}

export async function listDoorSwipeOperationLogs(
  params: { page?: number; pageSize?: number } = {},
): Promise<PagedResult<DoorSwipeRuleOperationLogRow>> {
  const res = await adminHttp.get<Result<PagedResult<DoorSwipeRuleOperationLogRow>>>(
    "/door-swipe-rule/operation-logs",
    { params },
  );
  const data = res.data?.data;
  return { list: data?.list ?? [], total: data?.total ?? 0, page: data?.page, pageSize: data?.pageSize };
}
