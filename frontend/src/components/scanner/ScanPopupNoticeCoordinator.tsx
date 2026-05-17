import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeResponse } from "@/api/types/scanner";
import { ViolationNoticeBanner } from "./ViolationNoticeBanner";
import { ScanAnnouncementBanner } from "./ScanAnnouncementBanner";

export type ScanNoticeDialogId = "violation" | "unbound" | "announcement";

type Props = {
  result: AnalyzeResponse;
};

export function ScanPopupNoticeCoordinator({ result }: Props) {
  const [dialogId, setDialogId] = useState<ScanNoticeDialogId | null>(null);
  const chainRef = useRef<ScanNoticeDialogId[]>([]);
  const chainConsumedRef = useRef(false);

  const violation = result.studentViolationNotice;
  const unbound = result.unboundCardNotice;
  const bundle = result.scanPopupAnnouncements;
  const announcementCount = bundle?.items?.filter((x) => x?.id)?.length ?? 0;
  const hasAnnouncement = Boolean(bundle?.enabled && announcementCount > 0);
  const hasViolation = violation?.id != null;
  const hasUnbound = unbound?.id != null;

  const scanSessionKey = useMemo(() => {
    const parts = [
      violation?.id ?? "",
      unbound?.id ?? "",
      hasAnnouncement ? bundle?.items?.map((x) => x.id).join(",") : "",
    ];
    return parts.join("|");
  }, [violation?.id, unbound?.id, hasAnnouncement, bundle?.items]);

  const autoOpenQueue = useMemo(() => {
    const q: ScanNoticeDialogId[] = [];
    if (hasViolation && violation.showNoticeEveryScan) q.push("violation");
    if (hasUnbound && unbound.showNoticeEveryScan) q.push("unbound");
    if (hasAnnouncement && bundle?.showNoticeEveryScan) q.push("announcement");
    return q;
  }, [hasViolation, violation?.showNoticeEveryScan, hasUnbound, unbound?.showNoticeEveryScan, hasAnnouncement, bundle?.showNoticeEveryScan]);

  useEffect(() => {
    chainRef.current = autoOpenQueue;
    chainConsumedRef.current = false;
    setDialogId(autoOpenQueue[0] ?? null);
  }, [scanSessionKey, autoOpenQueue.join(",")]);

  const openDialog = useCallback((id: ScanNoticeDialogId) => {
    chainConsumedRef.current = true;
    setDialogId(id);
  }, []);

  const closeDialog = useCallback((id: ScanNoticeDialogId) => {
    setDialogId((cur) => (cur === id ? null : cur));

    if (chainConsumedRef.current) return;
    const q = chainRef.current;
    const idx = q.indexOf(id);
    if (idx >= 0 && idx < q.length - 1) {
      const next = q[idx + 1];
      window.setTimeout(() => {
        setDialogId((cur) => (cur == null ? next : cur));
      }, 120);
    } else if (idx === q.length - 1) {
      chainConsumedRef.current = true;
    }
  }, []);

  if (!hasViolation && !hasUnbound && !hasAnnouncement) return null;

  return (
    <div className="pointer-events-auto z-[10002] flex w-full max-w-[min(96vw,1120px)] flex-row flex-wrap items-stretch justify-center gap-2 px-1">
      {hasViolation ? (
        <ViolationNoticeBanner
          notice={violation}
          kind="violation"
          panelOpen={dialogId === "violation"}
          onPanelOpenChange={(open) => (open ? openDialog("violation") : closeDialog("violation"))}
          suppressAutoOpen
        />
      ) : null}
      {hasUnbound ? (
        <ViolationNoticeBanner
          notice={unbound}
          kind="unbound"
          panelOpen={dialogId === "unbound"}
          onPanelOpenChange={(open) => (open ? openDialog("unbound") : closeDialog("unbound"))}
          suppressAutoOpen
        />
      ) : null}
      {hasAnnouncement ? (
        <ScanAnnouncementBanner
          bundle={bundle}
          panelOpen={dialogId === "announcement"}
          onPanelOpenChange={(open) => (open ? openDialog("announcement") : closeDialog("announcement"))}
          suppressAutoOpen
        />
      ) : null}
    </div>
  );
}

