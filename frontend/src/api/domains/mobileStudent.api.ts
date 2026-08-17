import axios from "axios";
import { publicHttp } from "@/api/core/publicHttp";
import { authHttp } from "@/api/core/authHttp";
import { unwrapApiResponse } from "@/api/core/http";
import type {
  HeatmapCell,
  RoomUsageItem,
  StudentActivityResult,
  StudentActivitySummary,
} from "@/api/domains/analytics.api";
import type { ScanDelayRequestResult } from "@/api/domains/scanDelay.api";
import type { ScanDelayOptionSummary } from "@/api/types/scanner";

// ======================== 类型 ========================

export interface MobileCenterProfile {
  name: string;
  departmentName: string;
  projectGroupName: string;
  roleLabel: string;
  authStatus: string;
  head: string;
  gender: number;
  mobilePhone: string;
  email: string;
  totalExp: number;
  allowedRoomsDisplayZh: string;
}

export interface MobileCenterStats {
  todayAccessCount: number;
  violationCount: number;
  unreadNoticeCount: number;
  accessibleRoomCount: number;
}

export interface MobileCenterRoom {
  roomId: string;
  roomName: string;
  floor: string;
  zone: string;
  occupantCount: number;
  capacity: number;
  occupancyRate: number;
  status: string;
  isPinned: boolean;
}

export interface MobileCenterRecord {
  time: string;
  type: string;
  roomName: string;
}

export interface MobileCenterNotice {
  title: string;
  type: string;
  publishDate: string;
}

export interface MobileCenterData {
  dashboard: MobileCenterDashboard;
  expiresAt: string;
  userId?: string;
  /** 仅 HTML5 token 接口：特权用户跳过房间/违规交互等过滤 */
  html5PrivilegeBypass?: boolean;
}

export interface MobileCenterDashboard {
  profile: MobileCenterProfile;
  stats: MobileCenterStats;
  pinnedRooms: MobileCenterRoom[];
  recentRecords: MobileCenterRecord[];
  recentNotices: MobileCenterNotice[];
}

export interface MobileTokenInfo {
  hasToken: boolean;
  token?: string;
  expiresAt?: string;
  createdAt?: string;
}

export interface MobileTokenGenerateResult {
  token: string;
  userId: string;
  expiresAt: string;
  durationDays: number;
}

// ======================== 公开 API ========================

/** 通过 token 获取学生中心数据（公开接口，无需登录） */
export async function fetchMobileCenter(token: string): Promise<MobileCenterData> {
  const resp = await publicHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: MobileCenterData;
  }>(`/public/mobile-center/${encodeURIComponent(token)}`);

  if (!resp.data.success) {
    throw new Error(resp.data.message || "加载失败");
  }
  return resp.data.data;
}

// ======================== 房间页（与小程序 wechat-overview + scan/analyze 同源） ========================

export interface MobileRoomDashboardOccupant {
  userId?: string;
  userName?: string;
  projectGroup?: string;
  entryTime?: string;
  entryType?: string;
}

export interface MobileRoomOverviewRow {
  roomId?: number | string;
  campus?: string;
  roomName?: string;
  totalCapacity?: number;
  remainingCards?: number;
  campusUserCount?: number;
  borrowedCardCount?: number;
  followingCount?: number;
  occupants?: MobileRoomDashboardOccupant[];
  /** 与 room_config.capacity_bind_room_id 一致（满员判断同源扫码弹窗） */
  capacityBindRoomId?: string | null;
}

// ======================== 豁免状态 ========================

export type ExemptDisplayPhase =
  | "none"
  | "pending_review"
  | "approved_active"
  | "approved_expired"
  | "rejected";

export interface ExemptStatus {
  phase: ExemptDisplayPhase;
  mode: "TIME" | "COUNT" | "BOTH" | null;
  expireAt: string | null;
  remainingText: string;
  roomNames: string[];
  maxCount: number | null;
  usedCount: number;
  requestId?: number;
  extendUntilTime?: string | null;
}

export interface MobileRoomAnalyzeDto {
  success?: boolean;
  message?: string;
  currentState?: string;
  pendingRooms?: Array<Record<string, unknown>>;
  allowedRooms?: Array<Record<string, unknown>>;
  globalUserState?: number;
  scanPopupEntryWindowEnabled?: boolean;
  scanPopupEntryAllowedNow?: boolean;
  scanPopupExemptRoomIds?: string[];
  studentViolationNotice?: { enterLocked?: boolean };
  unboundCardNotice?: { enterLocked?: boolean };
  autoSignoutState?: string | null;
  autoSignoutScheduledAt?: string | null;
  autoSignoutSecondsRemaining?: number | null;
  scanDelayEnabled?: boolean;
  scanDelayButtonLabel?: string;
  scanDelayOptionsByRoom?: Record<string, ScanDelayOptionSummary[]>;
  exemptStatus?: ExemptStatus | null;
}

export interface MobileRoomDashboardData {
  overview: MobileRoomOverviewRow[];
  analyze: MobileRoomAnalyzeDto;
  userId?: string;
}

/** 房间 Tab：wechat-overview + scan/analyze（与小程序房间页同源） */
export async function fetchMobileRoomDashboard(token: string): Promise<MobileRoomDashboardData> {
  const resp = await publicHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: MobileRoomDashboardData;
  }>(`/public/mobile-center/${encodeURIComponent(token)}/room-dashboard`);

  if (!resp.data.success) {
    throw new Error(resp.data.message || "加载失败");
  }
  const data = resp.data.data;
  return {
    overview: Array.isArray(data.overview) ? data.overview : [],
    analyze: data.analyze ?? {},
    userId: data.userId,
  };
}

// ======================== 房间 API（分组列表，保留兼容） ========================

export interface MobileRoomItem {
  roomId: string;
  roomName: string;
  floor: string;
  zone: string;
  occupantCount: number;
  campusUserCount: number;
  borrowedCardCount: number;
  capacity: number;
  occupancyRate: number;
  status: string; // "idle" | "busy" | "full"
  isPinned: boolean;
}

export interface MobileFloorGroup {
  floor: string;
  rooms: MobileRoomItem[];
}

export interface MobileCampusGroup {
  campus: string;
  floors: MobileFloorGroup[];
}

export interface MobileRoomsData {
  campusGroups: MobileCampusGroup[];
  totalCount: number;
}

/** 通过 token 获取学生房间列表（按校区/楼层分组，公开接口） */
export async function fetchMobileRooms(token: string, mode: "all" | "mine" = "all"): Promise<MobileRoomsData> {
  const resp = await publicHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: MobileRoomsData;
  }>(`/public/mobile-center/${encodeURIComponent(token)}/rooms?mode=${mode}`);

  if (!resp.data.success) {
    throw new Error(resp.data.message || "加载失败");
  }
  return resp.data.data;
}

// ======================== 公告/违规提醒 API ========================

export interface MobileAlertItem {
  kind:
    | "announcement"
    | "violation"
    | "exempt"
    | "material_feedback"
    | "scan_delay_feedback";
  id: number | string;
  title: string;
  contentHtml: string;
  publishAt?: string | null;
  expireAt?: string | null;
  createdAt?: string | null;
  /** CAGE_STATUS / MANUAL 等来源标识，用于区分笼位处理提示 vs 违规提醒 */
  source?: string;
  interactiveRequired: boolean;
  interactiveChallenge?: string;
  /** 是否已完成交互拼图确认 */
  interactiveChallengeVerified?: boolean;
  /** 当前是否禁止扫码进入（与扫码端 enterLocked 一致） */
  enterLocked?: boolean;
  /** 当前是否允许自助解禁 */
  canSelfUnblock?: boolean;
  /** 解禁方式：自助解禁 / 仅工作人员 */
  unblockMethod?: string;
  bizType?: string;
  bizId?: string;
  notificationId?: string;
  status?: string;
  isRead?: boolean;
  /** 与扫码弹窗同源：已选择「下次不再自动弹出」 */
  autoOpenSuppressed?: boolean;
}

export interface MobileAlertsData {
  /** 公告区：公告 + 豁免 + 违规 */
  announcements?: MobileAlertItem[];
  /** 审核反馈：物资申领 + 延迟申请 */
  feedbacks?: MobileAlertItem[];
  items: MobileAlertItem[];
  totalCount: number;
  html5PrivilegeBypass?: boolean;
}

/** 通过 token 获取公告与违规提醒（扫码弹窗公告源） */
export async function fetchMobileAlerts(token: string): Promise<MobileAlertsData> {
  const resp = await publicHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: MobileAlertsData;
  }>(`/public/mobile-center/${encodeURIComponent(token)}/alerts`);

  if (!resp.data.success) {
    throw new Error(resp.data.message || "加载失败");
  }
  return resp.data.data;
}

export type MobileNoticeAutoSuppressPayload = {
  noticeKind: "announcement" | "violation" | "unbound";
  recordId: number;
};

export type MobileNoticeAutoSuppressResult = {
  targetUserId?: string;
  noticeKind: string;
  recordId: number;
  autoOpenSuppressed: boolean;
};

/** 手机 H5：持久化「下次不再自动弹出」（与 /scan/notice-auto-suppress 同源） */
export async function suppressMobileNoticeAutoOpen(
  token: string,
  payload: MobileNoticeAutoSuppressPayload,
): Promise<MobileNoticeAutoSuppressResult> {
  const resp = await publicHttp.post<{
    code: number;
    success: boolean;
    message: string;
    data: MobileNoticeAutoSuppressResult;
  }>(`/public/mobile-center/${encodeURIComponent(token)}/notice-auto-suppress`, payload);

  if (!resp.data.success) {
    throw new Error(resp.data.message || "保存失败");
  }
  return resp.data.data;
}

// ======================== 出入记录 API ========================

export interface MobileAccessRecord {
  id: string;
  eventTime: string;
  eventType: string;
  roomName: string;
  personName: string;
}

export interface MobileAccessRecordsData {
  data: MobileAccessRecord[];
  total: number;
  page: number;
  size: number;
}

export async function fetchMobileAccessRecords(token: string, page = 1, size = 20): Promise<MobileAccessRecordsData> {
  const resp = await publicHttp.get<{ code: number; success: boolean; message?: string; data: MobileAccessRecordsData }>(
    `/public/mobile-center/${encodeURIComponent(token)}/access-records?page=${page}&size=${size}`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

// ======================== 申领 API ========================

export interface MobileMaterialCategory {
  id: number;
  name: string;
  icon?: string;
}

export interface MobileMaterialItem {
  id: number;
  name: string;
  categoryId?: number;
  categoryName?: string;
  subtitle?: string;
  coverUrl?: string;
  unit?: string;
  stockQuantity?: number;
  stockQty?: number;
  stockMode?: string;
  showStockQty?: number;
  thumbnailUrl?: string;
  specSchema?: string;
  specRequired?: number;
  independentOrder?: number; // 0=可合并下单 1=必须独立下单
}

export interface MobileMaterialsData {
  categories: MobileMaterialCategory[];
  items: MobileMaterialItem[];
  myRequests: any[];
}

export async function fetchMobileMaterials(token: string): Promise<MobileMaterialsData> {
  const resp = await publicHttp.get<{ code: number; success: boolean; message?: string; data: MobileMaterialsData }>(
    `/public/mobile-center/${encodeURIComponent(token)}/materials`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

function normalizeMaterialRequestLines(
  lines: { itemId: number; qty: number; specSnapshot?: string | Record<string, string> }[],
) {
  return lines.map((line) => ({
    itemId: line.itemId,
    qty: line.qty,
    specSnapshot: line.specSnapshot
      ? typeof line.specSnapshot === "string"
        ? line.specSnapshot
        : JSON.stringify(line.specSnapshot)
      : undefined,
  }));
}

/** HTML5 学生中心：用手机 token 提交申领（非 JWT，后端按 token 解析学生身份） */
export async function submitMobileMaterialRequest(
  token: string,
  lines: { itemId: number; qty: number; specSnapshot?: string }[],
  applicantGroup?: string,
  scheduledPickupTime?: string | null,
) {
  const resp = await publicHttp.post<{
    code: number;
    success: boolean;
    message?: string;
    data: unknown;
  }>(`/public/mobile-center/${encodeURIComponent(token)}/material/requests`, {
    lines: normalizeMaterialRequestLines(lines),
    applicantGroup,
    scheduledPickupTime,
  });
  if (!resp.data.success) throw new Error(resp.data.message || "提交失败");
  return resp.data.data;
}

// ======================== 笼架 API ========================

export interface MobileCageShelfSummary {
  shelveId: string;
  shelveName: string;
  roomId?: string;
  roomName?: string;
  campusName?: string;
  /** 本课题组 PI 匹配的笼架，前端高亮 */
  highlight?: boolean;
  /** 笼位类型计数（从快照聚合，key: "1"|"2"|"3"|"4" → count） */
  cageTypeCounts?: Record<string, number>;
}

export interface MobileCageShelvesAllData {
  shelves: MobileCageShelfSummary[];
  totalCount: number;
  scannedAt?: string;
}

/** 课题组全部笼架列表（公开 token 接口） */
export async function fetchMobileCageShelvesAll(token: string): Promise<MobileCageShelvesAllData> {
  const resp = await publicHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: MobileCageShelvesAllData;
  }>(`/public/mobile-center/${encodeURIComponent(token)}/cage-shelves/all`);

  if (!resp.data.success) {
    throw new Error(resp.data.message || "加载笼架列表失败");
  }
  const data = resp.data.data;
  return {
    shelves: Array.isArray(data?.shelves) ? data.shelves : [],
    totalCount: data?.totalCount ?? 0,
    scannedAt: data?.scannedAt,
  };
}

export interface MobileCageCellAnnotation {
  shelveId?: string;
  positionX?: number;
  positionY?: number;
  positionLabel?: string;
  richText?: string | null;
  images?: string | null;
  aroRawData?: string | null;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 特殊状态总览（公开 token 接口） */
export async function fetchMobileSpecialStatusOverview(
  token: string,
): Promise<import("@/api/domains/cageShelf.api").SpecialStatusOverview> {
  const resp = await publicHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: import("@/api/domains/cageShelf.api").SpecialStatusOverview;
  }>(
    `/public/mobile-center/${encodeURIComponent(token)}/cage-shelves/special-status-overview`,
  );
  if (!resp.data.success) {
    throw new Error(resp.data.message || "加载特殊状态失败");
  }
  return resp.data.data;
}

// ======================== 违规记录 API ========================

export interface MobileViolationItem {
  id: string;
  time: string;
  type: string;
  roomName: string;
  doorName?: string;
  /** 与扫码弹窗一致的富文本正文 */
  contentHtml?: string;
  status: "pending" | "processed" | "appealing";
  processedBy?: string;
  processedTime?: string;
}

export interface MobileViolationsData {
  data: MobileViolationItem[];
  total: number;
  page: number;
  size: number;
}

/** 通过 token 获取违规记录（公开接口） */
export async function fetchMobileViolations(
  token: string,
  page = 1,
  size = 20,
): Promise<MobileViolationsData> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });

  const resp = await publicHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: MobileViolationsData;
  }>(
    `/public/mobile-center/${encodeURIComponent(token)}/violations?${params.toString()}`,
  );

  if (!resp.data.success) {
    throw new Error(resp.data.message || "加载失败");
  }
  return resp.data.data;
}

// ======================== 课题组活跃度 API ========================

function mobileGroupActivityBase(token: string) {
  return `/public/mobile-center/${encodeURIComponent(token)}/group-activity`;
}

export async function fetchMobileGroupActivitySummary(
  token: string,
  params: { groupName: string; startTime: string; endTime: string; campus?: string },
): Promise<StudentActivitySummary> {
  const qs = new URLSearchParams({
    groupName: params.groupName,
    startTime: params.startTime,
    endTime: params.endTime,
    campus: params.campus ?? "all",
  });
  const resp = await publicHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: StudentActivitySummary;
  }>(`${mobileGroupActivityBase(token)}/summary?${qs.toString()}`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

export async function fetchMobileGroupActivityMembers(
  token: string,
  params: {
    groupName: string;
    startTime: string;
    endTime: string;
    sortBy?: string;
    order?: string;
    page?: number;
    size?: number;
  },
): Promise<StudentActivityResult> {
  const qs = new URLSearchParams({
    groupName: params.groupName,
    startTime: params.startTime,
    endTime: params.endTime,
    sortBy: params.sortBy ?? "entries",
    order: params.order ?? "desc",
    page: String(params.page ?? 1),
    size: String(params.size ?? 10),
  });
  const resp = await publicHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: StudentActivityResult;
  }>(`${mobileGroupActivityBase(token)}/members?${qs.toString()}`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

export async function fetchMobileGroupActivityHeatmap(
  token: string,
  params: { groupName: string; startTime: string; endTime: string },
): Promise<HeatmapCell[]> {
  const qs = new URLSearchParams({
    groupName: params.groupName,
    startTime: params.startTime,
    endTime: params.endTime,
  });
  const resp = await publicHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: HeatmapCell[];
  }>(`${mobileGroupActivityBase(token)}/heatmap?${qs.toString()}`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data ?? [];
}

export async function fetchMobileGroupActivityRoomUsage(
  token: string,
  params: { groupName: string; startTime: string; endTime: string },
): Promise<RoomUsageItem[]> {
  const qs = new URLSearchParams({
    groupName: params.groupName,
    startTime: params.startTime,
    endTime: params.endTime,
  });
  const resp = await publicHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: RoomUsageItem[];
  }>(`${mobileGroupActivityBase(token)}/room-usage?${qs.toString()}`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data ?? [];
}

// ======================== Token-based 写操作（用 token 替代登录态） ========================

/** 通过 bearer token 提交需求建议 */
export async function createMaterialDemandWithToken(
  bearerToken: string,
  suggestion: string,
): Promise<void> {
  const resp = await axios.post<{ code: number; success: boolean; message: string }>(
    "/api/material/demands",
    { suggestion },
    { headers: { Authorization: `Bearer ${bearerToken}` } },
  );
  if (!resp.data?.success) {
    throw new Error(resp.data?.message || "提交失败");
  }
}

// ======================== 管理 API（需登录） ========================

/** 获取学生当前活跃 token 信息 */
export async function fetchMobileTokenInfo(userId: string): Promise<MobileTokenInfo> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    data: MobileTokenInfo;
  }>(`/scan/student-mobile-token/${encodeURIComponent(userId)}`);
  return unwrapApiResponse(resp.data as any);
}

/** 生成/刷新 token（旧 token 全部失效）；任意已登录账号可用（扫码弹窗二维码） */
export async function generateMobileToken(
  userId: string,
  durationDays = 3,
): Promise<MobileTokenGenerateResult> {
  const resp = await authHttp.post<{
    code: number;
    success: boolean;
    data: MobileTokenGenerateResult;
  }>("/scan/student-mobile-token/generate", { userId, durationDays });
  return unwrapApiResponse(resp.data as any);
}

// ======================== 标记已读 ========================

/** 将所有反馈类通知标记为已读（公开 token 接口） */
export async function markMobileAlertsReadAll(token: string): Promise<void> {
  await publicHttp.post(`/public/mobile-center/${encodeURIComponent(token)}/alerts/read-all`);
}

// ======================== 延迟免冻结申请（token 模式） ========================

/** 手机 token 提交延迟免冻结申请（与扫码弹窗 submitScanDelayRequest 同源） */
export async function submitMobileScanDelayRequest(
  token: string,
  payload: { subjectUserId: string; roomId: string; optionId: number; reviewerUserId?: string },
): Promise<ScanDelayRequestResult> {
  const resp = await publicHttp.post<{
    code: number; success: boolean; message: string; data: ScanDelayRequestResult;
  }>(`/public/mobile-center/${encodeURIComponent(token)}/scan-delay/request`, payload);
  if (!resp.data.success || !resp.data.data) throw new Error(resp.data.message || "提交失败");
  return resp.data.data;
}
