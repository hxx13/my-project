import { authHttp } from "@/api/core/authHttp";
import type { SpecialStatusEntry } from "@/api/domains/cageShelf.api";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

// ======================== DTO 类型 ========================

/** QR 码验证响应，与后端 StudentQrVerifyResponse 对齐 */
export interface StudentQrVerifyResponse {
  verified: boolean;
  userId?: string;
  name?: string;
  departmentName?: string;
  projectGroupName?: string;
  message?: string;
}

/** 学生聚合档案，与后端 StudentProfileResponse 对齐 */
export interface StudentProfile {
  account: {
    username: string;
    role: string;
    createTime: string;
  };
  personnel: {
    userId: string;
    name: string;
    gender: number;
    mobilePhone: string;
    email: string;
    head: string;
    departmentName: string;
    projectGroupName: string;
    userTypeNames: string;
    allowedRoomsDisplayZh: string;
    hasOfficialRoomPermission: boolean;
    totalExp: number;
  } | null;
  stats: {
    recentAccessCount: number;
  };
}

/** 门禁记录条目（占位，后续与后端 DTO 对齐） */
export interface StudentAccessRecord {
  id: string;
  roomName: string;
  eventTime: string;
  eventType: string;
  personName: string;
}

/** 房间权限条目（占位，后续与后端 DTO 对齐） */
export interface StudentPermission {
  roomId: string;
  roomName: string;
  grantedAt: string;
}

// ======================== 认证相关 API ========================

/**
 * 上传 QR 码图片，后端 ZXing 解码并匹配 ARO 人员库
 * POST /api/auth/register/student/verify-qr
 */
export async function verifyQrCode(file: File): Promise<StudentQrVerifyResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await authHttp.post<Result<StudentQrVerifyResponse>>(
    "/auth/register/student/verify-qr",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "QR 验证失败");
  }
  return res.data.data;
}

/**
 * 手动输入 19 位人员编号，匹配 ARO 人员库
 * POST /api/auth/register/student/verify-userid
 */
export async function verifyUserId(userId: string): Promise<StudentQrVerifyResponse> {
  const res = await authHttp.post<Result<StudentQrVerifyResponse>>(
    "/auth/register/student/verify-userid",
    { userId }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "验证失败");
  }
  return res.data.data;
}

/**
 * 学生注册（免邀请码，以 user_id + QR 验证绑定）
 * POST /api/auth/register/student
 */
export async function registerStudent(
  userId: string,
  username: string,
  password: string
): Promise<Result<{ token: string; role: string; userInfo: unknown }>> {
  const res = await authHttp.post<Result<{ token: string; role: string; userInfo: unknown }>>(
    "/auth/register/student",
    { userId, username, password }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "注册失败");
  }
  return res.data;
}

// ======================== 学生档案 API ========================

/**
 * 学生激活（已有账号设密码，UPDATE 而非 INSERT）
 * POST /api/auth/register/student/activate
 */
export async function activateStudent(
  userId: string,
  username: string,
  password: string
): Promise<Result<{ token: string; role: string; userInfo: unknown }>> {
  const res = await authHttp.post<Result<{ token: string; role: string; userInfo: unknown }>>(
    "/auth/register/student/activate",
    { userId, username, password }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "激活失败");
  }
  return res.data;
}

/**
 * 获取学生个人聚合档案
 * GET /api/student/profile
 */
export async function fetchStudentProfile(): Promise<StudentProfile> {
  const res = await authHttp.get<Result<StudentProfile>>("/student/profile");
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取档案失败");
  }
  return res.data.data;
}

/**
 * 获取学生出入记录
 * GET /api/student/access-records
 */
export async function fetchStudentAccessRecords(
  page: number = 1,
  size: number = 20
): Promise<{ data: StudentAccessRecord[]; total: number }> {
  const res = await authHttp.get<Result<{ data: StudentAccessRecord[]; total: number }>>(
    "/student/access-records",
    { params: { page, size } }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取出入记录失败");
  }
  return res.data.data;
}

/**
 * 获取学生门禁权限
 * GET /api/student/permissions
 */
export async function fetchStudentPermissions(): Promise<{ rooms: StudentPermission[] }> {
  const res = await authHttp.get<Result<{ rooms: StudentPermission[] }>>("/student/permissions");
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取权限失败");
  }
  return res.data.data;
}

// ======================== Phase 2 类型 ========================

export interface DashboardData {
  profile: {
    name: string;
    /** 工号（= 学号），来自本地统一人员表 personnel */
    jobNumber?: string;
    departmentName: string;
    projectGroupName: string;
    /** 身份标识（本地身份标识系统 person_identity_tag.label，可多个） */
    identityLabels?: string[];
    authStatus: string;
    /** 头像 URL（来自 ARO 人员库） */
    head?: string;
    /** 性别：0=未知 1=男 2=女 */
    gender?: number;
    mobilePhone?: string;
    email?: string;
    /** 是否校内 0/1 */
    isSchool?: number;
    /** 官方可进房间列表（中文展示） */
    allowedRoomsDisplayZh?: string;
  };
  stats: {
    todayAccessCount: number;
    violationCount: number;
    unreadNoticeCount: number;
    accessibleRoomCount: number;
  };
  /** Web 学生首页指标卡（本课题组口径） */
  homeSummary?: HomeSummary;
  pinnedRooms: RoomData[];
  recentRecords: { time: string; type: string; roomName: string }[];
  recentNotices: { title: string; type: string; publishDate: string }[];
}

export interface HomeSummary {
  groupMemberCount: number;
  aupCount: number;
  /** 本课题组剩余笼位：Σ(预约数量 − 已使用)，跨房间跨 AUP 合并 */
  cageRemaining: number;
  remainingByRoom?: {
    roomName: string;
    rentNumber: number;
    usedNumber: number;
    remaining: number;
  }[];
}

// ======================== 本课题组笼位特殊状态（本地表单口径） ========================

/**
 * 笼位特殊状态汇总（通用接口，粒度靠参数切）。
 * scope=me|mine|all，groupBy=status|campus|floor|room|pi，statusCode/keyword/page/size 可选。
 */
export interface CageStatusSummary {
  scope: string;
  groupBy: string;
  groupNames: string[];
  /** 范围内笼位总数 */
  cagesTotal: number;
  /** 带任一状态标记的笼位数（同一笼位可多标，不等于 statusCounts 相加） */
  abnormalCages: number;
  /** statusCode → 该状态笼位数 */
  statusCounts: Record<string, number>;
  /** 按 groupBy 聚合：key/label/count */
  groups: { key: string; label: string; count: number }[];
  items: GroupStatusCage[];
  page: number;
  size: number;
  hasMore: boolean;
}

export interface GroupStatusCage {
  campusName?: string;
  floorName?: string;
  roomName?: string;
  shelveName?: string;
  positionX?: number;
  positionY?: number;
  cageBoxCode?: string;
  projectPiName?: string;
  piName?: string;
  experimenterName?: string;
  animalStrainName?: string;
  /** 特殊饲养名称（表单里选中的明细拼接） */
  detailName?: string;
  detailDescription?: string;
  needsDivision?: number;
  needsSpecialFeeding?: number;
  hasHealthAbnormality?: number;
  needsCohabitation?: number;
  needsTransfer?: number;
}

export interface CageStatusSummaryParams {
  scope?: "me" | "mine" | "all";
  statusCode?: string;
  groupBy?: "status" | "campus" | "floor" | "room" | "pi";
  keyword?: string;
  page?: number;
  size?: number;
}

/** 笼位特殊状态汇总：GET /api/v1/cage-shelves/status-summary */
export async function fetchCageStatusSummary(
  params: CageStatusSummaryParams = {},
): Promise<CageStatusSummary> {
  const res = await authHttp.get<Result<CageStatusSummary>>("/v1/cage-shelves/status-summary", {
    params,
  });
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取笼位状态汇总失败");
  }
  return res.data.data;
}

export interface RoomData {
  roomId: string;
  roomName: string;
  floor: string;
  zone: string;
  occupantCount: number;
  capacity: number;
  occupancyRate: number;
  status: 'idle' | 'busy' | 'full';
  isPinned: boolean;
}

export interface StatsData {
  period: { start: string; end: string; days: number };
  summary: { totalAccess: number; dailyAvg: number; attendanceDays: number; roomCount: number; violationCount: number };
  dailyTrend: { date: string; count: number; entryCount: number; exitCount: number }[];
  hourlyDistribution: { bucket: string; count: number; entryCount: number; exitCount: number }[];
  roomDistribution: { roomName: string; count: number; percentage: number }[];
  avgStayDuration: { roomName: string; durationMinutes: number }[];
}

export interface NotificationData {
  id: string;
  title: string;
  summary: string;
  /** 完整通知正文（HTML，含图片） */
  content?: string;
  type: 'PLATFORM' | 'WORK_ORDER';
  bizType?: string;
  bizId?: string;
  /** 违规镜像关联的 Obligation id（消息中心深链） */
  obligationId?: number;
  publishDate: string;
  isRead: boolean;
  sourceUrl?: string;
}

export interface ViolationData {
  id: string;
  time: string;
  type: string;
  roomName: string;
  doorName: string;
  description: string;
  penalty: string;
  status: 'pending' | 'processed' | 'appealing';
  processedBy?: string;
  processedTime?: string;
}

export interface FaqGroup {
  category: string;
  items: { question: string; answer: string }[];
}

export interface FeedbackTicketData {
  id: string;
  subject: string;
  content: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// ======================== Phase 2 API ========================

/**
 * 获取学生仪表盘数据
 * GET /api/student/dashboard
 */
export async function fetchDashboard(): Promise<DashboardData> {
  const res = await authHttp.get<Result<DashboardData>>("/student/dashboard");
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取仪表盘数据失败");
  }
  return res.data.data;
}

/** fetchRooms 查询参数 */
export interface FetchRoomsParams {
  pinned?: string;
  floor?: string;
  status?: string;
  search?: string;
  page?: number;
  size?: number;
}

/**
 * 获取房间列表
 * GET /api/student/rooms
 */
export async function fetchRooms(
  params: FetchRoomsParams = {}
): Promise<{ data: RoomData[]; total: number; page: number; size: number }> {
  const res = await authHttp.get<Result<{ data: RoomData[]; total: number; page: number; size: number }>>(
    "/student/rooms",
    { params }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取房间列表失败");
  }
  return res.data.data;
}

/**
 * 切换房间收藏状态
 * PUT /api/student/rooms/:roomId/pin
 */
export async function toggleRoomPin(roomId: string): Promise<void> {
  const res = await authHttp.put<Result<void>>(`/student/rooms/${roomId}/pin`);
  if (!res.data?.success) {
    throw new Error(res.data?.message || "操作失败");
  }
}

/**
 * 切换笼架收藏状态（shelveId 全局唯一，server 端从索引表反向查 roomId）
 * PUT /api/student/cage-shelves/:shelveId/pin
 */
export async function toggleCageShelfPin(shelveId: string): Promise<{ shelveId: string; isPinned: boolean }> {
  const res = await authHttp.put<Result<{ shelveId: string; isPinned: boolean }>>(
    `/student/cage-shelves/${shelveId}/pin`
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "操作失败");
  }
  return res.data.data!;
}

/** Pinned shelf detail returned by the server (includes roomId reverse-looked-up). */
export interface PinnedCageShelfDetail extends CageShelfDetail {
  isPinned?: boolean;
  roomId?: string;
}

/**
 * 获取已收藏的笼架详情列表（单次请求，含 roomId + grid 数据）
 * GET /api/student/cage-shelves/pinned
 */
export async function fetchPinnedCageShelves(): Promise<PinnedCageShelfDetail[]> {
  const res = await authHttp.get<Result<PinnedCageShelfDetail[]>>("/student/cage-shelves/pinned");
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取收藏笼架失败");
  }
  return res.data.data ?? [];
}

/**
 * 获取学生统计面板数据
 * GET /api/student/stats
 */
export async function fetchStats(period?: string): Promise<StatsData> {
  const res = await authHttp.get<Result<StatsData>>("/student/stats", {
    params: period ? { period } : undefined,
  });
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取统计数据失败");
  }
  return res.data.data;
}

/** fetchNotifications 查询参数 */
export interface FetchNotificationsParams {
  type?: string;
  page?: number;
  size?: number;
}

/**
 * 获取通知消息列表
 * GET /api/student/notifications
 */
export async function fetchNotifications(
  params: FetchNotificationsParams = {}
): Promise<{ data: NotificationData[]; total: number; unreadCount: number }> {
  const res = await authHttp.get<
    Result<{ data: NotificationData[]; total: number; unreadCount: number }>
  >("/student/notifications", { params });
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取通知失败");
  }
  return res.data.data;
}

/**
 * 标记通知已读
 * PUT /api/student/notifications/:id/read
 */
export async function markNotificationRead(id: string): Promise<void> {
  const res = await authHttp.put<Result<void>>(`/student/notifications/${id}/read`);
  if (!res.data?.success) {
    throw new Error(res.data?.message || "标记已读失败");
  }
}

/**
 * 标记全部通知已读
 * PUT /api/student/notifications/read-all
 */
export async function markAllNotificationsRead(): Promise<void> {
  const res = await authHttp.put<Result<void>>("/student/notifications/read-all");
  if (!res.data?.success) {
    throw new Error(res.data?.message || "全部已读失败");
  }
}

/** fetchViolations 查询参数 */
export interface FetchViolationsParams {
  page?: number;
  size?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * 获取违规记录列表
 * GET /api/student/violations
 */
export async function fetchViolations(
  params: FetchViolationsParams = {}
): Promise<{ data: ViolationData[]; total: number }> {
  const res = await authHttp.get<Result<{ data: ViolationData[]; total: number }>>(
    "/student/violations",
    { params }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取违规记录失败");
  }
  return res.data.data;
}

/** 学生端待办（Obligation） */
export interface StudentObligationRow {
  id: number;
  sourceType?: string;
  title?: string;
  contentHtml?: string;
  dispositionType?: string;
  dispositionConfigJson?: string | null;
  status?: string;
  dueAt?: string | null;
  deliveryMode?: "FULL_DISPOSITION" | "GUIDE_ONLY";
  channelCapability?: string;
  guideMessage?: string;
  redirectPath?: string;
}

export interface QuizDrawPayload {
  questionBankId: string;
  questions: Array<{ id: string; prompt: string; options: string[] }>;
}

export async function fetchMyObligations(
  params: { status?: string; channel?: string; limit?: number } = {}
): Promise<StudentObligationRow[]> {
  const res = await authHttp.get<Result<StudentObligationRow[]>>("/student/obligations/mine", {
    params: { channel: "H5", ...params },
  });
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取待办失败");
  }
  return res.data.data ?? [];
}

export async function markObligationDelivered(id: number): Promise<void> {
  const res = await authHttp.post<Result<{ ok: boolean }>>(`/student/obligations/${id}/delivered`);
  if (!res.data?.success) {
    throw new Error(res.data?.message || "标记送达失败");
  }
}

export async function drawObligationQuiz(id: number): Promise<QuizDrawPayload> {
  const res = await authHttp.get<Result<QuizDrawPayload>>(`/student/obligations/${id}/quiz-draw`);
  if (!res.data?.success) {
    throw new Error(res.data?.message || "抽题失败");
  }
  return res.data.data;
}

export async function completeObligation(
  id: number,
  answer: string,
  channel = "H5"
): Promise<void> {
  const res = await authHttp.post<Result<{ ok: boolean }>>(`/student/obligations/${id}/complete`, {
    answer,
    channel,
  });
  if (!res.data?.success) {
    throw new Error(res.data?.message || "处置失败");
  }
}

/**
 * 获取常见问题分组
 * GET /api/student/feedback/faq
 */
export async function fetchFaqGroups(): Promise<FaqGroup[]> {
  const res = await authHttp.get<Result<FaqGroup[]>>("/student/feedback/faq");
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取 FAQ 失败");
  }
  return res.data.data;
}

/**
 * 获取反馈工单列表
 * GET /api/student/feedback/tickets
 */
export async function fetchFeedbackTickets(
  page: number = 1,
  size: number = 10
): Promise<{ data: FeedbackTicketData[]; total: number }> {
  const res = await authHttp.get<
    Result<{ data: FeedbackTicketData[]; total: number }>
  >("/student/feedback/tickets", { params: { page, size } });
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取工单失败");
  }
  return res.data.data;
}

/** createFeedbackTicket 请求体 */
export interface CreateFeedbackTicketBody {
  subject: string;
  content: string;
  type: string;
}

/**
 * 创建反馈工单
 * POST /api/student/feedback/tickets
 */
export async function createFeedbackTicket(
  data: CreateFeedbackTicketBody
): Promise<FeedbackTicketData> {
  const res = await authHttp.post<Result<FeedbackTicketData>>(
    "/student/feedback/tickets",
    data
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "提交工单失败");
  }
  return res.data.data;
}

// ======================== 笼架信息 API ========================

/** 笼架筛选选项（按课题组范围过滤） */
export interface CageShelfFilterOptions {
  campuses: { campusId: number; campusName: string }[];
  areas: { areaId: string; areaName: string }[];
  floors: { floorId: string; floorName: string }[];
  rooms: { roomId: string; roomName: string; highlight?: boolean }[];
  shelves: { shelveId: string; shelveName: string; highlight?: boolean }[];
}

/** 笼架筛选选项查询参数 */
export interface CageShelfFilterOptionsParams {
  campusId?: number;
  areaId?: string;
  floorId?: string;
  roomId?: string;
}

/** 笼架单元格 */
export interface CageShelfCell {
  x: number;
  y: number;
  position: string;        // "A-1" 到 "H-10"
  empty: boolean;
  visible: boolean;        // 当前用户是否有权限查看详情
  stateLabel: string;
  projectPiName?: string;
  departmentName?: string;
  animalCageType?: number;
  cageBoxQrCode?: string;
  aupNumber?: string;
  rawDataJson?: string | null; // ARO 原始数据 JSON
  specialStatuses?: SpecialStatusEntry[];
  /** 健康异常严重程度（码表 item_code）；不是状态码，只喂右上角角标。 */
  healthSeverity?: string | null;
  /** 健康异常「瘙痒」（布尔子值），同样只喂角标。 */
  healthItch?: boolean | null;
  cageBoxInfo?: Record<string, unknown>;
  detail?: Record<string, unknown>;
}

/** 笼位标注 */
export interface CageCellAnnotation {
  shelveId?: string;
  positionX?: number;
  positionY?: number;
  positionLabel?: string;
  richText?: string | null;
  images?: string | null;       // JSON array of image URLs
  aroRawData?: string | null;  // Cached ARO official data JSON
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 笼架详情 */
export interface CageShelfDetail {
  shelfMeta: {
    campusName: string;
    areaName: string;
    floorName: string;
    roomName: string;
    shelveId: string;
    shelveName: string;
  };
  grid: CageShelfCell[];
  totalCells: number;
  filledCells: number;
  latestBatchId?: string | null;
}

// ======================== 房间在室人员 API ========================

/** 房间在室人员条目 */
export interface RoomOccupant {
  userId: string;
  userName: string;
  entryTime: string;
  entryType: "OWN_CARD" | "BORROWED_CARD";
}

/** 房间在室状态 */
export interface RoomStatusData {
  areaName: string;
  roomName: string;
  roomId: number;
  totalCapacity: number;
  campusUserCount: number;
  borrowedCardCount: number;
  remainingCards: number;
  occupants: RoomOccupant[];
}

/**
 * 获取所有房间的在室人员详情（房卡监控数据）
 * GET /api/v1/twin/cards/status
 */
export async function fetchRoomStatusList(): Promise<RoomStatusData[]> {
  const res = await authHttp.get<RoomStatusData[]>(
    "/v1/twin/cards/status"
  );
  return Array.isArray(res.data) ? res.data : [];
}

// ======================== AI 行为预测 API ========================

/** AI 预测单条记录 */
export interface AiPredictionRecord {
  user_id: string;
  user_name: string;
  room_id: string;
  room_name: string;
  peak_entry_time?: string;
  median_duration_mins?: number;
  predicted_exit_label?: string;
  overtime_prob?: number;
  visit_count?: number;
  next_room_prob?: string;
  entry_curve?: string;
  exit_curve?: string;
  weekly_entry_curve?: string;
  weekly_exit_curve?: string;
  update_time?: string;
}

/**
 * 获取当前学生的 AI 行为预测画像
 * GET /api/student/ai-profile
 */
export async function fetchStudentAiProfile(): Promise<AiPredictionRecord[]> {
  const res = await authHttp.get<Result<AiPredictionRecord[]>>(
    "/student/ai-profile"
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取 AI 画像失败");
  }
  return res.data.data ?? [];
}

// ======================== 课题组活跃度 API ========================

export interface GroupActivitySummary {
  memberCount: number;
  totalEntries: number;
  perCapitaWeeklyFreq: number;
  activeSharePct: number;
}

export interface MyActivityData {
  totalEntries: number;
  weeklyAvgFreq: number;
  totalDurationMinutes: number;
  lastActiveDate: string;
}

export interface StudentActivityResponse {
  groupName: string;
  groupSummary: GroupActivitySummary;
  myActivity: MyActivityData;
}

/**
 * 获取学生所在课题组的活跃度概览 + 个人活跃度
 * GET /api/student/activity
 */
export async function fetchStudentActivity(): Promise<StudentActivityResponse> {
  const res = await authHttp.get<Result<StudentActivityResponse>>(
    "/student/activity"
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取活跃度数据失败");
  }
  return res.data.data!;
}

// ======================== 培训答题 / 报名 ========================

export interface StudentPaperSummary {
  id: number;
  code: string;
  title: string;
  qualifyScore?: number;
  totalTime?: number;
  validFrom?: string | null;
  validTo?: string | null;
  submitted?: boolean;
  totalScore?: number | null;
  qualifyYn?: number | null;
  submittedAt?: string;
}

export interface StudentPaperField {
  questionKey: string;
  label: string;
  type: string;
  required?: boolean;
  options?: unknown;
  config?: Record<string, unknown>;
  sortOrder?: number;
}

export interface StudentPaperSection {
  code: string;
  label: string;
  fields: StudentPaperField[];
}

export interface StudentPaperDetail {
  id: number;
  code: string;
  title: string;
  qualifyScore?: number;
  totalTime?: number;
  sections: StudentPaperSection[];
  myAnswers?: Record<string, unknown> | null;
  myQualifyYn?: number | null;
}

export interface StudentTrainingOccurrence {
  id: number;
  startTime?: string;
  endTime?: string;
  address?: string;
  enrolled?: boolean;
  enrollmentId?: number | null;
  testYn?: number | null;
  /** 评分：0待评分 / 1合格 / 2不合格。与 testYn 双通过才算已通过 */
  testFraction?: number | null;
}

export interface StudentTraining {
  id: number;
  code?: string;
  name: string;
  typeName?: string;
  ownerIds?: string[];
  /** 所属人展示名，与 ownerIds 同序 */
  ownerNames?: string[];
  /** 学生端校区分组（浦东/浦西），空 = 未分组 */
  campus?: string | null;
  /** 学生端手动排序序号（同校区内升序） */
  studentSort?: number | null;
  eligible?: boolean;
  examPassed?: boolean;
  healthOk?: boolean;
  healthState?: number;
  papers?: { paperId: number; passed: boolean }[];
  occurrences: StudentTrainingOccurrence[];
}

export interface MyEnrollment {
  id: number;
  trainingName?: string;
  startTime?: string;
  endTime?: string;
  address?: string;
  testYn?: number;
  testFraction?: number;
  createdAt?: string;
}

export async function fetchMyExamPapers(): Promise<StudentPaperSummary[]> {
  const res = await authHttp.get<Result<StudentPaperSummary[]>>("/student/exam/papers");
  if (!res.data?.success) throw new Error(res.data?.message || "获取试卷失败");
  return res.data.data ?? [];
}

export async function fetchMyExamPaper(id: number): Promise<StudentPaperDetail> {
  const res = await authHttp.get<Result<StudentPaperDetail>>(`/student/exam/papers/${id}`);
  if (!res.data?.success) throw new Error(res.data?.message || "获取试卷失败");
  return res.data.data;
}

export async function submitExamPaper(
  id: number,
  answers: Record<string, unknown>,
): Promise<{ totalScore: number; maxScore: number; qualifyYn: number; perQuestion?: Record<string, { correct: boolean; earned: number }> }> {
  const res = await authHttp.post<Result<{ totalScore: number; maxScore: number; qualifyYn: number; perQuestion?: Record<string, { correct: boolean; earned: number }> }>>(
    `/student/exam/papers/${id}/submit`,
    { answers },
  );
  if (!res.data?.success) throw new Error(res.data?.message || "提交失败");
  return res.data.data;
}

export async function fetchMyTrainings(): Promise<StudentTraining[]> {
  const res = await authHttp.get<Result<StudentTraining[]>>("/student/training");
  if (!res.data?.success) throw new Error(res.data?.message || "获取培训失败");
  return res.data.data ?? [];
}

export async function enrollOccurrence(occurrenceId: number): Promise<void> {
  const res = await authHttp.post<Result<void>>(`/student/training/occurrences/${occurrenceId}/enroll`);
  if (!res.data?.success) throw new Error(res.data?.message || "报名失败");
}

export async function fetchMyEnrollments(): Promise<MyEnrollment[]> {
  const res = await authHttp.get<Result<MyEnrollment[]>>("/student/training/my");
  if (!res.data?.success) throw new Error(res.data?.message || "获取报名失败");
  return res.data.data ?? [];
}

export async function cancelMyEnrollment(id: number): Promise<void> {
  const res = await authHttp.delete<Result<void>>(`/student/training/enrollments/${id}`);
  if (!res.data?.success) throw new Error(res.data?.message || "取消失败");
}

export interface MyQualification {
  personId: string;
  itemKey: string;
  state: number;
  fileRef?: string | null;
}

export async function fetchMyQualifications(): Promise<MyQualification[]> {
  const res = await authHttp.get<Result<MyQualification[]>>("/student/training/qualifications");
  if (!res.data?.success) throw new Error(res.data?.message || "获取资格失败");
  return res.data.data ?? [];
}

export async function fetchMyQualificationReport(itemKey: string): Promise<Blob> {
  const res = await authHttp.get(`/student/training/qualifications/${itemKey}/report`, {
    responseType: "blob",
  });
  return res.data as Blob;
}


export interface StudentLearningMaterial {
  id: number;
  title: string;
  category?: string | null;
  originalName?: string | null;
  sizeBytes?: number | null;
}

export async function fetchLearningMaterialsForStudent(): Promise<StudentLearningMaterial[]> {
  const res = await authHttp.get<Result<StudentLearningMaterial[]>>("/student/training/learning-materials");
  if (!res.data?.success) throw new Error(res.data?.message || "获取学习资料失败");
  return res.data.data ?? [];
}

export async function fetchLearningMaterialFile(id: number): Promise<Blob> {
  const res = await authHttp.get(`/student/training/learning-materials/${id}/file`, {
    responseType: "blob",
  });
  return res.data as Blob;
}

export interface MyHealthSurvey {
  data: Record<string, unknown>;
  submittedAt?: string | null;
}

export async function fetchMyHealthSurvey(): Promise<MyHealthSurvey | null> {
  const res = await authHttp.get<Result<MyHealthSurvey | null>>("/student/training/health-survey");
  if (!res.data?.success) throw new Error(res.data?.message || "获取健康调查表失败");
  return res.data.data ?? null;
}

export async function submitHealthSurvey(data: Record<string, unknown>): Promise<void> {
  const res = await authHttp.put<Result<{ ok: boolean }>>("/student/training/health-survey", { data });
  if (!res.data?.success) throw new Error(res.data?.message || "提交失败");
}

/** 培训证书（发证即快照，与培训/试卷后续存续无关） */
export interface MyCertificate {
  id: number;
  templateKey: string;
  templateVersion?: string | null;
  personName?: string | null;
  trainingId?: number | null;
  trainingName?: string | null;
  enrollmentId?: number | null;
  trainingDate?: string | null;
  trainerName?: string | null;
  issuedAt?: string | null;
}

/** 证书模板：正文的唯一来源在后端（H5 与小程序共用，别在客户端各存一份） */
export interface CertificateTemplate {
  key: string;
  titleZh: string;
  titleEn: string;
  version: string;
  templateDate: string;
  intro: string;
  items: string[];
  outro: string;
}

export interface MyCertificatesPayload {
  list: MyCertificate[];
  templates: CertificateTemplate[];
}

export async function fetchMyCertificates(): Promise<MyCertificatesPayload> {
  const res = await authHttp.get<Result<MyCertificatesPayload>>("/student/training/certificates");
  if (!res.data?.success) throw new Error(res.data?.message || "获取证书失败");
  return res.data.data ?? { list: [], templates: [] };
}

/** 证书 PDF（后端出件），拿到 blob 交给预览弹窗 */
export async function fetchCertificatePdf(id: number): Promise<Blob> {
  const res = await authHttp.get(`/student/training/certificates/${id}/pdf`, { responseType: "blob" });
  return res.data as Blob;
}

// ======================== 课题组归属（子系统4） ========================

/** 我的课题组信息（/api/student/group/my）。无组时只有 hasGroup=false / isPi=false */
export interface MyGroupInfo {
  hasGroup: boolean;
  isPi: boolean;
  projectGroupId?: number;
  projectGroupName?: string;
  memberCount?: number;
}

/** 可申请课题组选项（value 为课题组 id 的字符串形式） */
export interface GroupOption {
  value: string;
  label: string;
}

export type GroupApplicationStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface MyGroupApplication {
  id: number;
  projectGroupId: number;
  projectGroupName?: string;
  status: GroupApplicationStatus;
  message?: string;
  rejectReason?: string;
  reviewedAt?: string;
  createdAt?: string;
}

export interface GroupMember {
  id: number;
  name?: string;
  jobNumber?: string;
  staffId?: string;
  aroUserId?: string;
}

export interface GroupJoinRequest {
  id: number;
  personnelId: number;
  applicantName?: string;
  message?: string;
  createdAt?: string;
}

export async function fetchMyGroup(): Promise<MyGroupInfo> {
  const res = await authHttp.get<Result<MyGroupInfo>>("/student/group/my");
  if (!res.data?.success) throw new Error(res.data?.message || "获取课题组信息失败");
  return res.data.data;
}

export async function fetchGroupOptions(): Promise<GroupOption[]> {
  const res = await authHttp.get<Result<GroupOption[]>>("/student/group/options");
  if (!res.data?.success) throw new Error(res.data?.message || "获取可申请课题组失败");
  return res.data.data ?? [];
}

export async function applyGroup(projectGroupId: number, message?: string): Promise<unknown> {
  const res = await authHttp.post<Result<unknown>>("/student/group/apply", {
    projectGroupId,
    message: message?.trim() ? message.trim() : undefined,
  });
  if (!res.data?.success) throw new Error(res.data?.message || "提交申请失败");
  return res.data.data;
}

export async function fetchMyGroupApplications(): Promise<MyGroupApplication[]> {
  const res = await authHttp.get<Result<MyGroupApplication[]>>("/student/group/applications");
  if (!res.data?.success) throw new Error(res.data?.message || "获取申请记录失败");
  return res.data.data ?? [];
}

export async function fetchGroupMembers(): Promise<GroupMember[]> {
  const res = await authHttp.get<Result<GroupMember[]>>("/student/group/members");
  if (!res.data?.success) throw new Error(res.data?.message || "获取成员名单失败");
  return res.data.data ?? [];
}

export async function fetchGroupRequests(): Promise<GroupJoinRequest[]> {
  const res = await authHttp.get<Result<GroupJoinRequest[]>>("/student/group/requests");
  if (!res.data?.success) throw new Error(res.data?.message || "获取待审申请失败");
  return res.data.data ?? [];
}

export async function approveGroupRequest(id: number): Promise<unknown> {
  const res = await authHttp.post<Result<unknown>>(`/student/group/requests/${id}/approve`);
  if (!res.data?.success) throw new Error(res.data?.message || "批准失败");
  return res.data.data;
}

export async function rejectGroupRequest(id: number, reason: string): Promise<unknown> {
  const res = await authHttp.post<Result<unknown>>(`/student/group/requests/${id}/reject`, { reason });
  if (!res.data?.success) throw new Error(res.data?.message || "拒绝失败");
  return res.data.data;
}

export async function removeGroupMember(personnelId: number, reason?: string): Promise<unknown> {
  const res = await authHttp.post<Result<unknown>>(`/student/group/members/${personnelId}/remove`, {
    reason: reason?.trim() ? reason.trim() : undefined,
  });
  if (!res.data?.success) throw new Error(res.data?.message || "移出成员失败");
  return res.data.data;
}
