import type { StudentViolationNotice } from "@/api/types/scanner";
import { ScanPopupNoticeBanner, type ViolationNoticeKind } from "./ScanPopupNoticeBanner";

export type { ViolationNoticeKind };

type Props = {
  notice: StudentViolationNotice | undefined | null;
  kind?: ViolationNoticeKind;
  targetUserId?: string;
  onInteractiveVerified?: (patch: {
    violationId: number;
    enterLocked: boolean;
    interactiveChallengeVerified: boolean;
    violationExpired?: boolean;
  }) => void;
  panelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
  suppressAutoOpen?: boolean;
};

/** @deprecated 请直接使用 ScanPopupNoticeBanner；保留别名以兼容旧引用 */
export function ViolationNoticeBanner({
  notice,
  kind = "violation",
  panelOpen,
  onPanelOpenChange,
}: Props) {
  return (
    <ScanPopupNoticeBanner
      kind={kind}
      notice={notice}
      panelOpen={panelOpen}
      onPanelOpenChange={onPanelOpenChange}
    />
  );
}
