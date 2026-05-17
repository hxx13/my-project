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
  return res.data?.data ?? [];
}

export async function createScanPopupAnnouncement(body: ScanPopupAnnouncementUpsert): Promise<ScanPopupAnnouncementRow> {
  const res = await adminHttp.post<ApiResponse<ScanPopupAnnouncementRow>>("/twin/scan-popup-announcements", body);
  return res.data?.data as ScanPopupAnnouncementRow;
}

export async function updateScanPopupAnnouncement(
  id: number,
  body: ScanPopupAnnouncementUpsert
): Promise<ScanPopupAnnouncementRow> {
  const res = await adminHttp.put<ApiResponse<ScanPopupAnnouncementRow>>(`/twin/scan-popup-announcements/${id}`, body);
  return res.data?.data as ScanPopupAnnouncementRow;
}

export async function deleteScanPopupAnnouncement(id: number): Promise<void> {
  await adminHttp.delete(`/twin/scan-popup-announcements/${id}`);
}
