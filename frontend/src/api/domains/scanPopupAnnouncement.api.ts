import { adminHttp } from "@/api/core/adminHttp";
import type { ApiResponse } from "@/api/types/common";
import {
  UNBOUND_APPLY_ROLE_OPTIONS,
  type UnboundApplyRoleCode,
  normalizeApplyRoleCodes,
} from "@/api/domains/studentViolation.api";

export type { UnboundApplyRoleCode };
export { UNBOUND_APPLY_ROLE_OPTIONS };

export interface ScanPopupAnnouncementRow {
  id: number;
  title: string;
  contentHtml?: string;
  enabled?: boolean;
  sortOrder?: number;
  status?: string;
  publishAt?: string | null;
  expireAt?: string | null;
  createdByUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** 被扫码人员选择「下次不再弹出」的累计人数 */
  autoSuppressCount?: number;
}

export interface ScanPopupAnnouncementSettings {
  enabled: boolean;
  showNoticeEveryScan: boolean;
  applyRoleCodes: UnboundApplyRoleCode[];
}

export interface ScanPopupAnnouncementUpsert {
  title: string;
  contentHtml: string;
  enabled: boolean;
  sortOrder: number;
  status?: string;
  publishAt?: string | null;
  expireAt?: string | null;
  /** 勾选后清空该公告全部「不再弹出」记录，被扫码人员将重新自动弹出 */
  clearAutoSuppress?: boolean;
}

export async function getScanPopupAnnouncementSettings(): Promise<ScanPopupAnnouncementSettings> {
  const res = await adminHttp.get<ApiResponse<ScanPopupAnnouncementSettings>>(
    "/twin/scan-popup-announcements/settings"
  );
  const data = res.data?.data;
  return {
    enabled: data?.enabled !== false,
    showNoticeEveryScan: data?.showNoticeEveryScan !== false,
    applyRoleCodes: normalizeApplyRoleCodes(data?.applyRoleCodes),
  };
}

export async function saveScanPopupAnnouncementSettings(
  body: ScanPopupAnnouncementSettings
): Promise<ScanPopupAnnouncementSettings> {
  const res = await adminHttp.put<ApiResponse<ScanPopupAnnouncementSettings>>(
    "/twin/scan-popup-announcements/settings",
    body
  );
  const data = res.data?.data;
  return {
    enabled: data?.enabled !== false,
    showNoticeEveryScan: data?.showNoticeEveryScan !== false,
    applyRoleCodes: normalizeApplyRoleCodes(data?.applyRoleCodes),
  };
}

export async function listScanPopupAnnouncements(): Promise<ScanPopupAnnouncementRow[]> {
  const res = await adminHttp.get<ApiResponse<ScanPopupAnnouncementRow[]>>("/twin/scan-popup-announcements");
  return (res.data?.data ?? []).map((row) => ({
    ...row,
    autoSuppressCount:
      typeof row.autoSuppressCount === "number"
        ? row.autoSuppressCount
        : Number((row as { auto_suppress_count?: number }).auto_suppress_count ?? 0) || 0,
  }));
}

export async function createScanPopupAnnouncement(body: ScanPopupAnnouncementUpsert): Promise<ScanPopupAnnouncementRow> {
  const res = await adminHttp.post<ApiResponse<ScanPopupAnnouncementRow>>("/twin/scan-popup-announcements", body);
  return res.data?.data as ScanPopupAnnouncementRow;
}

export async function updateScanPopupAnnouncement(
  id: number,
  body: ScanPopupAnnouncementUpsert
): Promise<ScanPopupAnnouncementRow & { clearedAutoSuppressCount?: number }> {
  const res = await adminHttp.put<
    ApiResponse<ScanPopupAnnouncementRow & { clearedAutoSuppressCount?: number }>
  >(`/twin/scan-popup-announcements/${id}`, body);
  const row = res.data?.data as ScanPopupAnnouncementRow & { clearedAutoSuppressCount?: number };
  const clearedRaw = row?.clearedAutoSuppressCount ?? (row as { cleared_auto_suppress_count?: number })?.cleared_auto_suppress_count;
  return {
    ...row,
    autoSuppressCount:
      typeof row?.autoSuppressCount === "number"
        ? row.autoSuppressCount
        : Number((row as { auto_suppress_count?: number })?.auto_suppress_count ?? 0) || 0,
    clearedAutoSuppressCount: typeof clearedRaw === "number" ? clearedRaw : Number(clearedRaw ?? 0) || 0,
  };
}

export async function deleteScanPopupAnnouncement(id: number): Promise<void> {
  await adminHttp.delete(`/twin/scan-popup-announcements/${id}`);
}

export async function clearScanPopupAnnouncementAutoSuppress(
  id: number
): Promise<{ announcementId: number; clearedCount: number }> {
  const res = await adminHttp.post<
    ApiResponse<{ announcementId: number; clearedCount: number }>
  >(`/twin/scan-popup-announcements/${id}/clear-auto-suppress`);
  const data = res.data?.data;
  return {
    announcementId: Number(data?.announcementId ?? id),
    clearedCount: Number(data?.clearedCount ?? 0),
  };
}
