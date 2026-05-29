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
