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
 * 上传 QR 码图片，解码并匹配 ARO 人员库
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
    departmentName: string;
    projectGroupName: string;
    roleLabel: string;
    authStatus: string;
    /** 头像 URL（来自 ARO 人员库） */
    head?: string;
    /** 性别：0=未知 1=男 2=女 */
    gender?: number;
    mobilePhone?: string;
    email?: string;
    /** 总经验值 */
    totalExp?: number;
    /** 官方可进房间列表（中文展示） */
    allowedRoomsDisplayZh?: string;
  };
  stats: {
    todayAccessCount: number;
    violationCount: number;
    unreadNoticeCount: number;
    accessibleRoomCount: number;
  };
  pinnedRooms: RoomData[];
  recentRecords: { time: string; type: string; roomName: string }[];
  recentNotices: { title: string; type: string; publishDate: string }[];
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
  dailyTrend: { date: string; count: number }[];
  hourlyDistribution: { bucket: string; count: number }[];
  roomDistribution: { roomName: string; count: number; percentage: number }[];
  avgStayDuration: { roomName: string; durationMinutes: number }[];
}

export interface NotificationData {
  id: string;
  title: string;
  summary: string;
  /** 完整通知正文（HTML，含图片） */
  content?: string;
  type: 'ARO' | 'PLATFORM' | 'WORK_ORDER';
  bizType?: string;
  bizId?: string;
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

/**
 * 获取笼架筛选选项（按课题组范围过滤，支持级联参数）
 * GET /api/student/cage-shelves/filter-options
 */
export async function fetchStudentCageShelfFilterOptions(
  params: CageShelfFilterOptionsParams = {}
): Promise<CageShelfFilterOptions> {
  const res = await authHttp.get<Result<CageShelfFilterOptions>>(
    "/student/cage-shelves/filter-options",
    { params }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取筛选选项失败");
  }
  return res.data.data;
}

/**
 * 获取笼架详情（含 8x10 网格数据）
 * GET /api/student/cage-shelves/:shelveId/detail
 */
export async function fetchStudentCageShelfDetail(
  shelveId: string
): Promise<CageShelfDetail> {
  const res = await authHttp.get<Result<CageShelfDetail>>(
    `/student/cage-shelves/${shelveId}/detail`
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取笼架详情失败");
  }
  return res.data.data;
}

/**
 * 触发笼架快照刷新
 * POST /api/student/cage-shelves/refresh
 */
export async function refreshStudentCageShelf(): Promise<{
  message: string;
  refreshedShelves: number;
}> {
  const res = await authHttp.post<
    Result<{ message: string; refreshedShelves: number }>
  >("/student/cage-shelves/refresh");
  if (!res.data?.success) {
    throw new Error(res.data?.message || "刷新失败");
  }
  return res.data.data;
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

// ======================== 笼位标注 API ========================

/**
 * 获取笼位标注信息
 * GET /api/student/cage-shelves/{shelveId}/cells/{x}/{y}/annotation
 */
export async function fetchCellAnnotation(
  shelveId: string,
  x: number,
  y: number,
): Promise<CageCellAnnotation | null> {
  const res = await authHttp.get<Result<CageCellAnnotation | null>>(
    `/student/cage-shelves/${shelveId}/cells/${x}/${y}/annotation`,
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "获取标注失败");
  }
  return res.data.data ?? null;
}

/**
 * 保存笼位标注
 * PUT /api/student/cage-shelves/{shelveId}/cells/{x}/{y}/annotation
 */
export async function saveCellAnnotation(
  shelveId: string,
  x: number,
  y: number,
  position: string,
  data: { richText?: string; images?: string; aroRawData?: string },
): Promise<void> {
  const res = await authHttp.put<Result<void>>(
    `/student/cage-shelves/${shelveId}/cells/${x}/${y}/annotation`,
    { position, ...data },
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "保存标注失败");
  }
}

/** 学生端特殊状态总览（仅本课题组可见的笼位） */
export async function fetchStudentSpecialStatusOverview() {
  const res = await authHttp.get<Result<any>>("/student/cage-shelves/special-status-overview");
  if (!res.data?.success) throw new Error(res.data?.message || "加载失败");
  return res.data.data;
}
