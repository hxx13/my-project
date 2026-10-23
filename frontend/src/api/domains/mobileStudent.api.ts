import { authHttp } from "@/api/core/authHttp";
import { unwrapApiResponse } from "@/api/core/http";
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
  expiresAt?: string;
}

// ======================== 公开 API ========================


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

// ======================== 公告/违规提醒 API ========================

export interface MobileAlertItem {
  kind:
    | "general_notice"
    | "announcement"
    | "violation"
    | "exempt"
    | "material_feedback"
    | "scan_delay_feedback";
  /** 后端 sectionOf：GENERAL = 通用公告，PERSONAL = 我的提醒 */
  section?: "GENERAL" | "PERSONAL";
  id: number | string;
  title: string;
  contentHtml: string;
  publishAt?: string | null;
  expireAt?: string | null;
  createdAt?: string | null;
  /** 门户公告优先级：important / notice / routine（仅 general_notice 带） */
  priority?: string | null;
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
  /** 关联 Obligation，消息 → 待办深链 */
  obligationId?: number;
  sourceUrl?: string;
  mpPath?: string;
  contentJson?: string | null;
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
  /** 最新一条公告晚于本人读游标 → 首页公告区显示红点 */
  announcementsUnread?: boolean;
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

// ======================== 免登录码（需登录） ========================

/** 获取账号当前活跃免登录码 */
export async function fetchMobileTokenInfo(userId: string): Promise<MobileTokenInfo> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    data: MobileTokenInfo;
  }>(`/scan/student-mobile-token/${encodeURIComponent(userId)}`);
  return unwrapApiResponse(resp.data as any);
}

/** 生成/轮换免登录码（旧码立即失效）；本人或教职工及以上 */
export async function generateMobileToken(userId: string): Promise<MobileTokenGenerateResult> {
  const resp = await authHttp.post<{
    code: number;
    success: boolean;
    data: MobileTokenGenerateResult;
  }>("/scan/student-mobile-token/generate", { userId });
  return unwrapApiResponse(resp.data as any);
}

