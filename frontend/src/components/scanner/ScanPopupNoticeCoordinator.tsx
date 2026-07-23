import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AnalyzeResponse } from "@/api/types/scanner";

import { ScanPopupNoticeBanner } from "./ScanPopupNoticeBanner";
import { ScanNoticePanelCard } from "./ScanNoticePanelCard";
import { ScanNoticeStripPortal } from "./ScanNoticeStripPortal";
import {
  announcementPanelKey,
  isAnnouncementPanelKey,
  parseAnnouncementPanelId,
  type ScanNoticePanelKey,
} from "./scanNoticePanelId";
import { canAutoOpenNoticesOnPopupOpen } from "./scanNoticeAutoOpen";
import type { NoticeKind } from "./scanPopupTheme";

export type ScanNoticeDialogId = "violation" | "unbound" | "announcement" | "cage-notice";

type Props = {
  result: AnalyzeResponse;
  onViolationInteractiveVerified?: (patch: {
    violationId: number;
    enterLocked: boolean;
    interactiveChallengeVerified: boolean;
    violationExpired?: boolean;
  }) => void;
};

function buildAutoOpenQueue(args: {
  hasViolation: boolean;
  violationShowEveryScan: boolean | undefined;
  hasUnbound: boolean;
  unboundShowEveryScan: boolean | undefined;
  hasAnnouncement: boolean;
  showAnnEveryScan: boolean;
}): ScanNoticeDialogId[] {
  const q: ScanNoticeDialogId[] = [];
  if (args.hasViolation && args.violationShowEveryScan) q.push("violation");
  if (args.hasUnbound && args.unboundShowEveryScan) q.push("unbound");
  if (args.hasAnnouncement && args.showAnnEveryScan) q.push("announcement");
  return q;
}

function suppressKey(kind: NoticeKind, recordId: number): string {
  return `${kind}:${recordId}`;
}

export function ScanPopupNoticeCoordinator({ result, onViolationInteractiveVerified }: Props) {
  /** 弹窗首次打开时的在馆状态；不随后续进入/离开刷新 */
  const initialStateRef = useRef(result.currentState);
  const autoOpenAppliedRef = useRef(false);

  const [openPanels, setOpenPanels] = useState<ScanNoticePanelKey[]>([]);
  /** 本会话内刚完成服务端 suppress，避免同次扫码重复自动弹出 */
  const [sessionSuppressedKeys, setSessionSuppressedKeys] = useState<Set<string>>(() => new Set());
  /** true = 扫码后同时平铺；false = 用户手动点灵动岛（公告多条时仍单窗翻页） */
  const [tiledAutoOpen, setTiledAutoOpen] = useState(false);
  const [manualAnnPage, setManualAnnPage] = useState(0);

  const violation = result.studentViolationNotice;
  const isCageNotice = violation?.ruleName?.startsWith("[CAGE]") ?? false;
  const cageNotice = isCageNotice ? violation : undefined;
  const actualViolation = isCageNotice ? undefined : violation;
  const unbound = result.unboundCardNotice;
  const bundle = result.scanPopupAnnouncements;

  const announcementItems = useMemo(
    () => bundle?.items?.filter((x) => x?.id) ?? [],
    [bundle?.items]
  );
  const announcementIds = useMemo(
    () => announcementItems.map((x) => x.id!),
    [announcementItems]
  );
  const announcementCount = announcementItems.length;
  const hasAnnouncement = Boolean(bundle?.enabled && announcementCount > 0);
  const hasCageNotice = cageNotice?.id != null;
  const hasViolation = actualViolation?.id != null;
  const hasUnbound = unbound?.id != null;
  const targetUserId = result.userInfo?.userId;
  const showAnnEveryScan = Boolean(bundle?.showNoticeEveryScan);

  const isAutoOpenSuppressed = useCallback(
    (kind: NoticeKind, recordId: number, fromServer?: boolean) =>
      Boolean(fromServer) || sessionSuppressedKeys.has(suppressKey(kind, recordId)),
    [sessionSuppressedKeys]
  );

  const markAutoOpenSuppressed = useCallback((kind: NoticeKind, recordId: number) => {
    setSessionSuppressedKeys((prev) => {
      const next = new Set(prev);
      next.add(suppressKey(kind, recordId));
      return next;
    });
  }, []);

  const autoOpenQueue = useMemo(
    () =>
      buildAutoOpenQueue({
        hasViolation: hasViolation || (hasCageNotice ?? false),
        violationShowEveryScan: (hasViolation ? actualViolation?.showNoticeEveryScan : undefined) ?? cageNotice?.showNoticeEveryScan,
        hasUnbound,
        unboundShowEveryScan: unbound?.showNoticeEveryScan,
        hasAnnouncement,
        showAnnEveryScan,
      }),
    [
      hasViolation,
      hasCageNotice,
      actualViolation?.showNoticeEveryScan,
      cageNotice?.showNoticeEveryScan,
      hasUnbound,
      unbound?.showNoticeEveryScan,
      hasAnnouncement,
      showAnnEveryScan,
    ]
  );

  /** 仅在弹窗本轮首次挂载、且打开时未进入，自动平铺通告一次（换人刷卡靠外层 key remount） */
  useEffect(() => {
    if (autoOpenAppliedRef.current) return;
    autoOpenAppliedRef.current = true;

    if (!canAutoOpenNoticesOnPopupOpen(initialStateRef.current)) {
      return;
    }

    const keys: ScanNoticePanelKey[] = [];
    for (const slot of autoOpenQueue) {
      if (slot === "violation") {
        // 笼位处理提示 → 独立岛
        if (cageNotice?.id != null) {
          if (!isAutoOpenSuppressed("violation", cageNotice.id, cageNotice.autoOpenSuppressed)) {
            keys.push("cage-notice");
          }
        } else if (actualViolation?.id != null) {
          if (!isAutoOpenSuppressed("violation", actualViolation.id, actualViolation.autoOpenSuppressed)) {
            keys.push("violation");
          }
        }
      }
      if (slot === "unbound" && unbound?.id != null) {
        if (!isAutoOpenSuppressed("unbound", unbound.id, unbound.autoOpenSuppressed)) {
          keys.push("unbound");
        }
      }
      if (slot === "announcement") {
        for (const item of announcementItems) {
          if (!item.id) continue;
          if (!isAutoOpenSuppressed("announcement", item.id, item.autoOpenSuppressed)) {
            keys.push(announcementPanelKey(item.id));
          }
        }
      }
    }
    if (keys.length === 0) return;

    setOpenPanels(keys);
    setTiledAutoOpen(keys.length > 1);
    setManualAnnPage(0);
    // 仅挂载时评估一次；弹窗内 currentState 变化（含离开后变未进入）不得再次弹出
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 进入成功后收起通告条带；不因离开后再变未进入而重新弹出 */
  useEffect(() => {
    if (result.currentState === "INSIDE") {
      setOpenPanels([]);
      setTiledAutoOpen(false);
      setManualAnnPage(0);
    }
  }, [result.currentState]);

  const closePanel = useCallback((key: ScanNoticePanelKey) => {
    setOpenPanels((prev) => prev.filter((k) => k !== key));
  }, []);

  const closeAllPanels = useCallback(() => {
    setOpenPanels([]);
  }, []);

  const closeAnnouncementPanels = useCallback(() => {
    setOpenPanels((prev) =>
      prev.filter((k) => k !== "announcement-manual" && !isAnnouncementPanelKey(k))
    );
  }, []);

  const openManual = useCallback(
    (slot: ScanNoticeDialogId) => {
      setTiledAutoOpen(false);
      setManualAnnPage(0);
      if (slot === "violation") {
        setOpenPanels(["violation"]);
        return;
      }
      if (slot === "cage-notice") {
        setOpenPanels(["cage-notice"]);
        return;
      }
      if (slot === "unbound") {
        setOpenPanels(["unbound"]);
        return;
      }
      if (slot === "announcement") {
        if (announcementCount <= 1 && announcementItems[0]?.id) {
          setOpenPanels([announcementPanelKey(announcementItems[0].id)]);
        } else {
          setOpenPanels(["announcement-manual"]);
        }
      }
    },
    [announcementCount, announcementItems]
  );

  const isIslandOpen = useCallback(
    (slot: ScanNoticeDialogId) => {
      if (openPanels.length === 0) return false;
      if (slot === "violation") return openPanels.includes("violation");
      if (slot === "cage-notice") return openPanels.includes("cage-notice");
      if (slot === "unbound") return openPanels.includes("unbound");
      if (slot === "announcement") {
        return openPanels.some(
          (k) => k === "announcement-manual" || isAnnouncementPanelKey(k)
        );
      }
      return false;
    },
    [openPanels]
  );

  const renderStripPanels = () => {
    if (openPanels.length === 0) return null;

    if (!tiledAutoOpen && openPanels.includes("announcement-manual")) {
      const item = announcementItems[Math.min(manualAnnPage, announcementCount - 1)];
      if (!item?.id) return null;
      return (
        <ScanNoticePanelCard
          key="announcement-manual"
          kind="announcement"
          panelKey="announcement-manual"
          scannedUserId={targetUserId}
          autoOpenSuppressed={Boolean(item.autoOpenSuppressed)}
          onAutoOpenSuppressed={() => item.id != null && markAutoOpenSuppressed("announcement", item.id)}
          item={item}
          showNoticeEveryScan={showAnnEveryScan}
          manualAnnouncementPage={manualAnnPage}
          manualAnnouncementTotal={announcementCount}
          onManualAnnouncementPrev={() =>
            setManualAnnPage((i) => (i - 1 + announcementCount) % announcementCount)
          }
          onManualAnnouncementNext={() =>
            setManualAnnPage((i) => (i + 1) % announcementCount)
          }
          onClose={() => closePanel("announcement-manual")}
        />
      );
    }

    return openPanels.map((key) => {
      if (key === "cage-notice" && cageNotice?.id != null) {
        return (
          <ScanNoticePanelCard
            key={key}
            kind="cage-notice"
            panelKey={key}
            scannedUserId={targetUserId}
            autoOpenSuppressed={Boolean(cageNotice.autoOpenSuppressed)}
            onAutoOpenSuppressed={() => markAutoOpenSuppressed("violation", cageNotice.id)}
            notice={cageNotice}
            targetUserId={targetUserId}
            onInteractiveVerified={onViolationInteractiveVerified}
            onClose={() => closePanel(key)}
          />
        );
      }
      if (key === "violation" && actualViolation?.id != null) {
        return (
          <ScanNoticePanelCard
            key={key}
            kind="violation"
            panelKey={key}
            scannedUserId={targetUserId}
            autoOpenSuppressed={Boolean(actualViolation.autoOpenSuppressed)}
            onAutoOpenSuppressed={() => markAutoOpenSuppressed("violation", actualViolation.id)}
            notice={actualViolation}
            targetUserId={targetUserId}
            onInteractiveVerified={onViolationInteractiveVerified}
            onClose={() => closePanel(key)}
          />
        );
      }
      if (key === "unbound" && unbound?.id != null) {
        return (
          <ScanNoticePanelCard
            key={key}
            kind="unbound"
            panelKey={key}
            scannedUserId={targetUserId}
            autoOpenSuppressed={Boolean(unbound.autoOpenSuppressed)}
            onAutoOpenSuppressed={() => markAutoOpenSuppressed("unbound", unbound.id)}
            notice={unbound}
            targetUserId={targetUserId}
            onInteractiveVerified={onViolationInteractiveVerified}
            onClose={() => closePanel(key)}
          />
        );
      }
      if (isAnnouncementPanelKey(key)) {
        const annId = parseAnnouncementPanelId(key);
        const item = announcementItems.find((x) => x.id === annId);
        if (!item?.id) return null;
        return (
          <ScanNoticePanelCard
            key={key}
            kind="announcement"
            panelKey={key}
            scannedUserId={targetUserId}
            autoOpenSuppressed={Boolean(item.autoOpenSuppressed)}
            onAutoOpenSuppressed={() => markAutoOpenSuppressed("announcement", item.id!)}
            item={item}
            showNoticeEveryScan={showAnnEveryScan}
            onClose={() => closePanel(key)}
          />
        );
      }
      return null;
    });
  };

  if (!hasCageNotice && !hasViolation && !hasUnbound && !hasAnnouncement) return null;

  return (
    <>
      <div className="pointer-events-auto z-[10002] flex w-full max-w-[min(67.2vw,784px)] flex-row flex-wrap items-stretch justify-center gap-2 px-1">
        {hasCageNotice ? (
          <ScanPopupNoticeBanner
            kind="cage-notice"
            notice={cageNotice}
            panelOpen={isIslandOpen("cage-notice")}
            onPanelOpenChange={(open) => (open ? openManual("cage-notice") : closePanel("cage-notice"))}
          />
        ) : null}
        {hasViolation ? (
          <ScanPopupNoticeBanner
            kind="violation"
            notice={actualViolation}
            panelOpen={isIslandOpen("violation")}
            onPanelOpenChange={(open) => (open ? openManual("violation") : closePanel("violation"))}
          />
        ) : null}
        {hasUnbound ? (
          <ScanPopupNoticeBanner
            kind="unbound"
            notice={unbound}
            panelOpen={isIslandOpen("unbound")}
            onPanelOpenChange={(open) => (open ? openManual("unbound") : closePanel("unbound"))}
          />
        ) : null}
        {hasAnnouncement ? (
          <ScanPopupNoticeBanner
            kind="announcement"
            bundle={bundle}
            announcementCount={announcementCount}
            manualAnnouncementPage={manualAnnPage}
            panelOpen={isIslandOpen("announcement")}
            onPanelOpenChange={(open) =>
              open ? openManual("announcement") : closeAnnouncementPanels()
            }
          />
        ) : null}
      </div>

      <ScanNoticeStripPortal
        open={openPanels.length > 0}
        panelCount={openPanels.length}
        onCloseAll={closeAllPanels}
      >
        {renderStripPanels()}
      </ScanNoticeStripPortal>
    </>
  );
}
