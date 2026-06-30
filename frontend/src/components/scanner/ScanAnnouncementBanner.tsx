import type { ScanPopupAnnouncementBundle } from "@/api/types/scanner";
import { ScanPopupNoticeBanner } from "./ScanPopupNoticeBanner";

type Props = {
  bundle: ScanPopupAnnouncementBundle | null | undefined;
  panelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
};

/** @deprecated 请直接使用 ScanPopupNoticeBanner；保留别名以兼容旧引用 */
export function ScanAnnouncementBanner({ bundle, panelOpen, onPanelOpenChange }: Props) {
  const count = bundle?.items?.filter((x) => x?.id)?.length ?? 0;
  return (
    <ScanPopupNoticeBanner
      kind="announcement"
      bundle={bundle}
      announcementCount={count}
      panelOpen={panelOpen}
      onPanelOpenChange={onPanelOpenChange}
    />
  );
}
