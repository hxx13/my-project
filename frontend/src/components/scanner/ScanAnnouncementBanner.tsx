import type { ScanPopupAnnouncementBundle } from "@/api/types/scanner";
import { ScanPopupNoticeBanner } from "./ScanPopupNoticeBanner";

type Props = {
  bundle: ScanPopupAnnouncementBundle | null | undefined;
  panelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
  suppressAutoOpen?: boolean;
};

/** @deprecated 请直接使用 ScanPopupNoticeBanner；保留别名以兼容旧引用 */
export function ScanAnnouncementBanner({
  bundle,
  panelOpen,
  onPanelOpenChange,
  suppressAutoOpen,
}: Props) {
  return (
    <ScanPopupNoticeBanner
      kind="announcement"
      bundle={bundle}
      panelOpen={panelOpen}
      onPanelOpenChange={onPanelOpenChange}
      suppressAutoOpen={suppressAutoOpen}
    />
  );
}
