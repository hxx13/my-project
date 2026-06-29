import { authHttp } from "@/api/core/authHttp";
import type {
  MobileCenterProfile,
  MobileCenterStats,
  MobileCenterRoom,
  MobileCenterRecord,
  MobileCenterNotice,
  MobileRoomDashboardData,
  MobileRoomsData,
  MobileAccessRecordsData,
  MobileMaterialsData,
  MobileViolationsData,
  MobileAlertsData,
  MobileCageShelvesAllData,
  MobileNoticeAutoSuppressPayload,
  MobileNoticeAutoSuppressResult,
  MobileCageCellAnnotation,
  ExemptStatus,
} from "./mobileStudent.api";
import type { CageShelfDetail } from "@/features/student/api/student.api";
import { normalizeMobileCageShelfDetail } from "@/pages/mobile/mobileCageShelfGrid";
import type {
  StudentActivitySummary,
  StudentActivityResult,
  HeatmapCell,
  RoomUsageItem,
} from "@/api/domains/analytics.api";

// ======================== 类型 ========================

export interface StudentMobileHomeData {
  stats: MobileCenterStats;
  pinnedRooms: MobileCenterRoom[];
  recentRecords: MobileCenterRecord[];
  recentNotices: MobileCenterNotice[];
}

// ======================== Profile ========================

export async function fetchStudentMobileProfile(): Promise<MobileCenterProfile> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: MobileCenterProfile;
  }>(`/student/mobile/profile`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

// ======================== Home ========================

export async function fetchStudentMobileHome(): Promise<StudentMobileHomeData> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: StudentMobileHomeData;
  }>(`/student/mobile/home`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

// ======================== Room Dashboard ========================

export async function fetchStudentMobileRoomDashboard(): Promise<MobileRoomDashboardData> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: MobileRoomDashboardData;
  }>(`/student/mobile/room-dashboard`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

// ======================== Exempt Status ========================

export async function fetchStudentMobileExemptStatus(): Promise<ExemptStatus | null> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: ExemptStatus | null;
  }>(`/student/mobile/exempt-status`);
  if (!resp.data.success) return null;
  return resp.data.data ?? null;
}

// ======================== Rooms ========================

export async function fetchStudentMobileRooms(
  mode: "all" | "mine" = "all"
): Promise<MobileRoomsData> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: MobileRoomsData;
  }>(`/student/mobile/rooms?mode=${mode}`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

// ======================== Access Records ========================

export async function fetchStudentMobileAccessRecords(
  page = 1,
  size = 20
): Promise<MobileAccessRecordsData> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message?: string;
    data: MobileAccessRecordsData;
  }>(`/student/mobile/access-records?page=${page}&size=${size}`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

// ======================== Materials ========================

export async function fetchStudentMobileMaterials(): Promise<MobileMaterialsData> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message?: string;
    data: MobileMaterialsData;
  }>(`/student/mobile/materials`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

export async function submitStudentMobileMaterialRequest(
  lines: { itemId: number; qty: number }[],
  applicantGroup?: string
) {
  const resp = await authHttp.post<{
    code: number;
    success: boolean;
    message?: string;
    data: unknown;
  }>(`/student/mobile/material/requests`, {
    lines,
    applicantGroup,
  });
  if (!resp.data.success) throw new Error(resp.data.message || "提交失败");
  return resp.data.data;
}

// ======================== Cage Shelves ========================

export async function fetchStudentMobileCageShelvesAll(): Promise<MobileCageShelvesAllData> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: MobileCageShelvesAllData;
  }>(`/student/mobile/cage-shelves/all`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载笼架列表失败");
  const data = resp.data.data;
  return {
    shelves: Array.isArray(data?.shelves) ? data.shelves : [],
    totalCount: data?.totalCount ?? 0,
  };
}

export async function fetchStudentMobileCageShelfDetail(
  shelveId: string
): Promise<CageShelfDetail> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: Record<string, unknown>;
  }>(`/student/mobile/cage-shelves/${encodeURIComponent(shelveId)}/detail`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载笼架详情失败");
  return normalizeMobileCageShelfDetail(resp.data.data ?? {});
}

export async function fetchStudentMobileCageCellAnnotation(
  shelveId: string,
  x: number,
  y: number
): Promise<MobileCageCellAnnotation | null> {
  const resp = await authHttp.get<{
    success: boolean;
    message?: string;
    data: MobileCageCellAnnotation | null;
  }>(
    `/student/mobile/cage-shelves/${encodeURIComponent(shelveId)}/cells/${x}/${y}/annotation`
  );
  if (!resp.data.success) throw new Error(resp.data.message || "获取标注失败");
  return resp.data.data ?? null;
}

export async function saveStudentMobileCageCellAnnotation(
  shelveId: string,
  x: number,
  y: number,
  position: string,
  data: { richText?: string; images?: string; aroRawData?: string }
): Promise<void> {
  const resp = await authHttp.put<{
    success: boolean;
    message?: string;
  }>(
    `/student/mobile/cage-shelves/${encodeURIComponent(shelveId)}/cells/${x}/${y}/annotation`,
    { position, ...data }
  );
  if (!resp.data.success) throw new Error(resp.data.message || "保存标注失败");
}

// ======================== Violations ========================

export async function fetchStudentMobileViolations(
  page = 1,
  size = 20
): Promise<MobileViolationsData> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: MobileViolationsData;
  }>(`/student/mobile/violations?${params.toString()}`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

// ======================== Alerts ========================

export async function fetchStudentMobileAlerts(): Promise<MobileAlertsData> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: MobileAlertsData;
  }>(`/student/mobile/alerts`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

// ======================== Notice Auto Suppress ========================

export async function suppressStudentMobileNoticeAutoOpen(
  payload: MobileNoticeAutoSuppressPayload
): Promise<MobileNoticeAutoSuppressResult> {
  const resp = await authHttp.post<{
    code: number;
    success: boolean;
    message: string;
    data: MobileNoticeAutoSuppressResult;
  }>(`/student/mobile/notice-auto-suppress`, payload);
  if (!resp.data.success) throw new Error(resp.data.message || "保存失败");
  return resp.data.data;
}

// ======================== Group Activity ========================

function studentMobileGroupActivityBase() {
  return `/student/mobile/group-activity`;
}

export async function fetchStudentMobileGroupActivitySummary(
  params: { groupName: string; startTime: string; endTime: string; campus?: string }
): Promise<StudentActivitySummary> {
  const qs = new URLSearchParams({
    groupName: params.groupName,
    startTime: params.startTime,
    endTime: params.endTime,
    campus: params.campus ?? "all",
  });
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: StudentActivitySummary;
  }>(`${studentMobileGroupActivityBase()}/summary?${qs.toString()}`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

export async function fetchStudentMobileGroupActivityMembers(
  params: {
    groupName: string;
    startTime: string;
    endTime: string;
    sortBy?: string;
    order?: string;
    page?: number;
    size?: number;
  }
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
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: StudentActivityResult;
  }>(`${studentMobileGroupActivityBase()}/members?${qs.toString()}`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data;
}

export async function fetchStudentMobileGroupActivityHeatmap(
  params: { groupName: string; startTime: string; endTime: string }
): Promise<HeatmapCell[]> {
  const qs = new URLSearchParams({
    groupName: params.groupName,
    startTime: params.startTime,
    endTime: params.endTime,
  });
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: HeatmapCell[];
  }>(`${studentMobileGroupActivityBase()}/heatmap?${qs.toString()}`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data ?? [];
}

export async function fetchStudentMobileGroupActivityRoomUsage(
  params: { groupName: string; startTime: string; endTime: string }
): Promise<RoomUsageItem[]> {
  const qs = new URLSearchParams({
    groupName: params.groupName,
    startTime: params.startTime,
    endTime: params.endTime,
  });
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: RoomUsageItem[];
  }>(`${studentMobileGroupActivityBase()}/room-usage?${qs.toString()}`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载失败");
  return resp.data.data ?? [];
}
