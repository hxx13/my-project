import { http } from "@/api/core/http";
import { unwrapData, type ApiResponse } from "@/api/types/common";

import type { ScanNoticeAutoSuppressPayload } from "./scanNoticeDismissStorage";

export type ScanNoticeAutoSuppressResult = {
  targetUserId: string;
  noticeKind: string;
  recordId: number;
  autoOpenSuppressed: boolean;
};

/** 被扫码人员：服务端持久化「下次不再自动弹出」 */
export async function suppressScanNoticeAutoOpen(
  payload: ScanNoticeAutoSuppressPayload
): Promise<ScanNoticeAutoSuppressResult> {
  const response = await http.post<
    ApiResponse<ScanNoticeAutoSuppressResult> | ScanNoticeAutoSuppressResult
  >("/scan/notice-auto-suppress", {
    targetUserId: payload.targetUserId,
    noticeKind: payload.noticeKind,
    recordId: payload.recordId,
  });
  const raw = unwrapData(response.data, {} as ScanNoticeAutoSuppressResult);
  const recordIdNum = typeof raw.recordId === "number" ? raw.recordId : Number(raw.recordId);
  return {
    targetUserId: String(raw.targetUserId ?? payload.targetUserId),
    noticeKind: String(raw.noticeKind ?? payload.noticeKind),
    recordId: Number.isFinite(recordIdNum) ? recordIdNum : payload.recordId,
    autoOpenSuppressed: Boolean(raw.autoOpenSuppressed),
  };
}
