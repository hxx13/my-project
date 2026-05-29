import { authHttp } from "@/api/core/authHttp";

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
  type: 'ARO' | 'PLATFORM';
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
 * 切换房间置顶状态
 * PUT /api/student/rooms/:roomId/pin
 */
export async function toggleRoomPin(roomId: string): Promise<void> {
  const res = await authHttp.put<Result<void>>(`/student/rooms/${roomId}/pin`);
  if (!res.data?.success) {
    throw new Error(res.data?.message || "操作失败");
  }
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
