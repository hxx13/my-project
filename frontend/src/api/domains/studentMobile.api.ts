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
  ExemptStatus,
} from "./mobileStudent.api";
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

export async function submitStudentMobileMaterialRequest(
  lines: { itemId: number; qty: number; specSnapshot?: string }[],
  applicantGroup?: string,
  scheduledPickupTime?: string | null,
) {
  const resp = await authHttp.post<{
    code: number;
    success: boolean;
    message?: string;
    data: unknown;
  }>(`/student/mobile/material/requests`, {
    lines: normalizeMaterialRequestLines(lines),
    applicantGroup,
    scheduledPickupTime,
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
    scannedAt: data?.scannedAt,
  };
}

export async function fetchStudentMobileSpecialStatusOverview(): Promise<import("@/api/domains/cageShelf.api").SpecialStatusOverview> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: import("@/api/domains/cageShelf.api").SpecialStatusOverview;
  }>(`/student/mobile/cage-shelves/special-status-overview`);
  if (!resp.data.success) throw new Error(resp.data.message || "加载特殊状态失败");
  return resp.data.data;
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

// ======================== Mark Read ========================

export async function markStudentMobileAlertsReadAll(): Promise<void> {
  await authHttp.post(`/student/mobile/alerts/read-all`);
}
