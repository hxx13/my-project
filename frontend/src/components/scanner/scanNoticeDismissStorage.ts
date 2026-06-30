import type { NoticeKind } from "./scanPopupTheme";

export const NOTICE_DISMISS_WAIT_SECONDS = 30;

export type ScanNoticeAutoSuppressPayload = {
  targetUserId: string;
  noticeKind: NoticeKind;
  recordId: number;
};
