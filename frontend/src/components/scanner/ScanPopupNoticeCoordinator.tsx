import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AnalyzeResponse } from "@/api/types/scanner";

import { ScanPopupNoticeBanner } from "./ScanPopupNoticeBanner";



export type ScanNoticeDialogId = "violation" | "unbound" | "announcement";



type Props = {

  result: AnalyzeResponse;

  onViolationInteractiveVerified?: (patch: {

    violationId: number;

    enterLocked: boolean;

    interactiveChallengeVerified: boolean;

    violationExpired?: boolean;

  }) => void;

};



export function ScanPopupNoticeCoordinator({ result, onViolationInteractiveVerified }: Props) {

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

  const targetUserId = result.userInfo?.userId;



  const scanSessionKey = useMemo(() => {

    const parts = [

      violation?.id ?? "",

      unbound?.id ?? "",

      hasAnnouncement ? bundle?.items?.map((x) => x.id).join(",") : "",

    ];

    return parts.join("|");

  }, [violation?.id, unbound?.id, hasAnnouncement, bundle?.items]);



  const isInside = result.currentState === "INSIDE";

  const autoOpenQueue = useMemo(() => {

    const q: ScanNoticeDialogId[] = [];

    /* 进入状态时不自动弹出任何公告弹窗，仅离开/未知状态时弹出 */
    if (isInside) return q;

    if (hasViolation && violation.showNoticeEveryScan) q.push("violation");

    if (hasUnbound && unbound.showNoticeEveryScan) q.push("unbound");

    if (hasAnnouncement && bundle?.showNoticeEveryScan) q.push("announcement");

    return q;

  }, [isInside, hasViolation, violation?.showNoticeEveryScan, hasUnbound, unbound?.showNoticeEveryScan, hasAnnouncement, bundle?.showNoticeEveryScan]);



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

        <ScanPopupNoticeBanner

          kind="violation"

          notice={violation}

          targetUserId={targetUserId}

          onInteractiveVerified={onViolationInteractiveVerified}

          panelOpen={dialogId === "violation"}

          onPanelOpenChange={(open) => (open ? openDialog("violation") : closeDialog("violation"))}

          suppressAutoOpen

        />

      ) : null}

      {hasUnbound ? (

        <ScanPopupNoticeBanner

          kind="unbound"

          notice={unbound}

          targetUserId={targetUserId}

          onInteractiveVerified={onViolationInteractiveVerified}

          panelOpen={dialogId === "unbound"}

          onPanelOpenChange={(open) => (open ? openDialog("unbound") : closeDialog("unbound"))}

          suppressAutoOpen

        />

      ) : null}

      {hasAnnouncement ? (

        <ScanPopupNoticeBanner

          kind="announcement"

          bundle={bundle}

          panelOpen={dialogId === "announcement"}

          onPanelOpenChange={(open) => (open ? openDialog("announcement") : closeDialog("announcement"))}

          suppressAutoOpen

        />

      ) : null}

    </div>

  );

}


