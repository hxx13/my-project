import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronRight, CreditCard, Megaphone } from "lucide-react";
import type { ScanPopupAnnouncementBundle, StudentViolationNotice } from "@/api/types/scanner";
import { prepareAnnouncementHtml } from "@/utils/announcementHtml";
import { useTheme } from "@/features/theme/ThemeProvider";
import { InteractiveChallenge } from "./InteractiveChallenge";
import { ScanNoticeDoodleCard } from "./ScanNoticeDoodleCard";
import { ackViolationInteractivePermanent } from "./twinViolationInteractive";
import {
  noticeThemeClass,
  resolveScanPopupNoticeMeta,
  type NoticeKind,
} from "./scanPopupTheme";

export type ViolationNoticeKind = "violation" | "unbound";

type PanelControlProps = {
  panelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
  suppressAutoOpen?: boolean;
};

type InteractiveVerifiedPatch = {
  violationId: number;
  enterLocked: boolean;
  interactiveChallengeVerified: boolean;
  violationExpired?: boolean;
};

type ViolationUnboundProps = PanelControlProps & {
  kind: ViolationNoticeKind;
  notice: StudentViolationNotice | undefined | null;
  targetUserId?: string;
  onInteractiveVerified?: (patch: InteractiveVerifiedPatch) => void;
};

type AnnouncementProps = PanelControlProps & {
  kind: "announcement";
  bundle: ScanPopupAnnouncementBundle | null | undefined;
};

export type ScanPopupNoticeBannerProps = ViolationUnboundProps | AnnouncementProps;

function noticeAckKey(kind: NoticeKind, id: number): string {
  if (kind === "announcement") return `twin_scan_announcement_ack_${id}`;
  if (kind === "unbound") return "twin_unbound_card_notice_ack";
  return `twin_violation_notice_ack_${id}`;
}

function readAcked(kind: NoticeKind, id: number): boolean {
  try {
    return sessionStorage.getItem(noticeAckKey(kind, id)) === "1";
  } catch {
    return false;
  }
}

function useControlledPanel(
  panelOpenProp: boolean | undefined,
  onPanelOpenChange: ((open: boolean) => void) | undefined
) {
  const [panelOpenInternal, setPanelOpenInternal] = useState(false);
  const controlled = panelOpenProp !== undefined && onPanelOpenChange != null;
  const panelOpen = controlled ? panelOpenProp : panelOpenInternal;
  const setPanelOpen = useCallback(
    (open: boolean) => {
      if (controlled) onPanelOpenChange(open);
      else setPanelOpenInternal(open);
    },
    [controlled, onPanelOpenChange]
  );
  return { panelOpen, setPanelOpen, controlled, setPanelOpenInternal };
}

function buildIslandLabel(args: {
  kind: NoticeKind;
  panelOpen: boolean;
  showEveryScan: boolean;
  sessionAcked: boolean;
  interactivePhrase: string | null;
  interactiveDone: boolean;
  isViolation: boolean;
  pageIndex?: number;
  totalPages?: number;
  headline?: string;
}): string {
  const {
    kind,
    panelOpen,
    showEveryScan,
    sessionAcked,
    interactivePhrase,
    interactiveDone,
    isViolation,
    pageIndex = 0,
    totalPages = 1,
    headline,
  } = args;

  if (kind === "announcement") {
    const pageSuffix = totalPages > 1 ? ` · ${pageIndex + 1}/${totalPages}` : "";
    if (sessionAcked) return `公告（已知晓）${pageSuffix}`;
    if (panelOpen) return "详情已展开 · 点我收起";
    return totalPages > 1 ? `扫码公告 · ${pageIndex + 1}/${totalPages}` : "扫码公告 · 点我查看";
  }

  if (interactivePhrase) {
    return interactiveDone
      ? "交互验证 · 已完成"
      : `🧩 ${panelOpen ? "请完成验证" : "交互验证 · 点我"}`;
  }
  if (sessionAcked) {
    return isViolation ? "违规记录（已知晓）" : "未绑卡（已知晓）";
  }
  if (panelOpen) return "详情已展开 · 点我收起";
  if (showEveryScan) {
    return isViolation ? "违规警示 · 点我" : "未绑卡警示 · 点我";
  }
  if (headline?.trim()) return headline.trim();
  return isViolation ? "违规通告 · 点我查看" : "未绑卡提示 · 点我查看";
}

/**
 * 扫码弹窗公告统一组件：违规 / 未绑卡 / 扫码公告共用同一套 Island + 详情弹窗。
 * 无全屏遮罩；扫码公告仅顶栏 ✕ 可关闭；违规/未绑卡支持外侧点击关闭与交互拼图验证。
 */
export function ScanPopupNoticeBanner(props: ScanPopupNoticeBannerProps) {
  const { kind, panelOpen: panelOpenProp, onPanelOpenChange, suppressAutoOpen = false } = props;
  const { theme } = useTheme();
  const isDark = theme.mode === "dark";
  const meta = resolveScanPopupNoticeMeta(kind);
  const themeClass = noticeThemeClass(kind);
  /** Portal / Island 需挂主题根 + 公告类型 class，语义令牌才能正确解析 */
  const noticeThemeShell = `${theme.className} ${isDark ? "dark" : ""} ${themeClass}`;

  const { panelOpen, setPanelOpen, controlled, setPanelOpenInternal } = useControlledPanel(
    panelOpenProp,
    onPanelOpenChange
  );

  const announcementItems = useMemo(() => {
    if (kind !== "announcement") return [];
    return props.bundle?.items?.filter((x) => x?.id) ?? [];
  }, [kind, kind === "announcement" ? props.bundle?.items : null]);

  const notice = kind === "announcement" ? null : props.notice;
  const [pageIndex, setPageIndex] = useState(0);
  const announcementTotal = announcementItems.length;
  const announcementCurrent =
    kind === "announcement" && announcementTotal > 0
      ? announcementItems[Math.min(pageIndex, announcementTotal - 1)]
      : null;

  const recordId = kind === "announcement" ? announcementCurrent?.id : notice?.id;
  const showEveryScan =
    kind === "announcement"
      ? Boolean(props.bundle?.showNoticeEveryScan)
      : Boolean(notice?.showNoticeEveryScan);

  const isViolation = kind === "violation";
  const locked = Boolean(notice?.enterLocked);
  const remaining = isViolation ? notice?.remainingEnterAllowance : undefined;

  useEffect(() => {
    if (kind !== "announcement") return;
    setPageIndex(0);
  }, [kind, announcementItems.map((x) => x.id).join(",")]);

  useEffect(() => {
    if (suppressAutoOpen || controlled) return;
    if (kind === "announcement") {
      if (!announcementTotal) {
        setPanelOpenInternal(false);
        return;
      }
      setPanelOpenInternal(showEveryScan);
      return;
    }
    if (!notice?.id) return;
    setPanelOpenInternal(showEveryScan);
  }, [
    suppressAutoOpen,
    controlled,
    kind,
    notice?.id,
    showEveryScan,
    announcementTotal,
    setPanelOpenInternal,
  ]);

  const images = useMemo(() => {
    if (kind === "announcement" || !notice?.imageUrls?.length) return [];
    return notice.imageUrls.filter((u) => typeof u === "string" && u.trim().length > 0);
  }, [kind, notice?.imageUrls]);

  const interactivePhrase =
    kind === "announcement" ? null : notice?.interactiveChallenge || null;

  const unblockMethod: string | undefined =
    kind !== "announcement" ? notice?.unblockMethod : undefined;
  const canSelfUnblock: boolean | undefined =
    kind !== "announcement" ? notice?.canSelfUnblock : undefined;

  const [interactiveDone, setInteractiveDone] = useState(
    Boolean(kind !== "announcement" && notice?.interactiveChallengeVerified)
  );
  const [interactiveSaving, setInteractiveSaving] = useState(false);
  const prevRecordIdRef = useRef<number | null | undefined>(null);

  /** 是否因解禁方式为"仅工作人员"而不展示拼图 */
  const interactiveBlockedByMethod =
    Boolean(interactivePhrase) && !interactiveDone && unblockMethod === "仅工作人员";
  /** 是否因已达自助解禁上限而不展示拼图 */
  const interactiveBlockedByLimit =
    Boolean(interactivePhrase) && !interactiveDone && unblockMethod === "自助解禁" && canSelfUnblock === false;
  /** 是否展示交互拼图（未完成 + 未被上述两种原因屏蔽） */
  const showInteractivePuzzle =
    Boolean(interactivePhrase) && !interactiveDone && !interactiveBlockedByMethod && !interactiveBlockedByLimit;

  useEffect(() => {
    if (kind === "announcement") return;
    if (notice?.id !== prevRecordIdRef.current) {
      prevRecordIdRef.current = notice?.id;
      setInteractiveDone(Boolean(notice?.interactiveChallengeVerified));
    } else if (notice?.interactiveChallengeVerified) {
      setInteractiveDone(true);
    }
  }, [kind, notice?.id, notice?.interactiveChallengeVerified]);

  const announcementCloseViaButtonOnly = kind === "announcement";

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (announcementCloseViaButtonOnly) return;
        e.preventDefault();
        e.stopPropagation();
        setPanelOpen(false);
        return;
      }
      if (kind === "announcement" && announcementTotal > 1) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setPageIndex((i) => (i - 1 + announcementTotal) % announcementTotal);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setPageIndex((i) => (i + 1) % announcementTotal);
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panelOpen, kind, announcementTotal, setPanelOpen, announcementCloseViaButtonOnly]);

  const acknowledge = useCallback(() => {
    if (recordId == null || showEveryScan) return;
    if (showInteractivePuzzle) return;
    try {
      sessionStorage.setItem(noticeAckKey(kind, recordId), "1");
    } catch {
      /* ignore */
    }
    setPanelOpen(false);
  }, [recordId, showEveryScan, showInteractivePuzzle, kind, setPanelOpen]);

  const closePanel = useCallback(() => setPanelOpen(false), [setPanelOpen]);
  const openPanel = useCallback(() => setPanelOpen(true), [setPanelOpen]);

  /** 扫码公告：仅顶栏 ✕ 可关闭；关闭时仍写入 session 已读（与原先「已知悉」一致） */
  const closeAnnouncementViaHeader = useCallback(() => {
    if (recordId != null && !showEveryScan) {
      try {
        sessionStorage.setItem(noticeAckKey("announcement", recordId), "1");
      } catch {
        /* ignore */
      }
    }
    setPanelOpen(false);
  }, [recordId, showEveryScan, setPanelOpen]);

  const bodyHtmlSource =
    kind === "announcement"
      ? announcementCurrent?.contentHtml || ""
      : notice?.violationText || "";
  const safeHtml = useMemo(() => prepareAnnouncementHtml(bodyHtmlSource), [bodyHtmlSource]);

  const dialogHeadline =
    kind === "announcement" ? announcementCurrent?.title || "扫码公告" : undefined;

  const sessionAcked = recordId != null && !showEveryScan && readAcked(kind, recordId);

  if (kind === "announcement") {
    if (!props.bundle?.enabled || announcementTotal === 0 || !announcementCurrent?.id) return null;
  } else if (notice?.id == null) {
    return null;
  }
  const islandLabel = buildIslandLabel({
    kind,
    panelOpen,
    showEveryScan,
    sessionAcked,
    interactivePhrase,
    interactiveDone,
    isViolation,
    pageIndex,
    totalPages: announcementTotal,
  });

  const targetUserId = kind === "announcement" ? undefined : props.targetUserId;
  const onInteractiveVerified = kind === "announcement" ? undefined : props.onInteractiveVerified;
  const PanelIcon =
    kind === "announcement" ? Megaphone : kind === "violation" ? AlertTriangle : CreditCard;

  return (
    <>
      <div
        className={`flex min-w-[min(90px,19.6vw)] max-w-[224px] flex-1 basis-0 justify-center ${noticeThemeShell}`}
      >
        <button
          type="button"
          onClick={() => {
            if (announcementCloseViaButtonOnly && panelOpen) return;
            if (panelOpen) closePanel();
            else openPanel();
          }}
          className={`group scan-notice-island w-full ${panelOpen ? "scan-notice-island--open" : ""}`}
        >
          <span className="scan-notice-island-icon relative shrink-0">
            <PanelIcon className="h-3.5 w-3.5" />
            {locked ? (
              <span
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--app-color-feedback-danger)] ring-2 ring-[var(--app-color-surface-page)]"
                aria-hidden
              />
            ) : null}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="scan-notice-island-tag mb-0.5 block w-fit">{meta.islandTag}</span>
            <span className="scan-notice-island-label">{islandLabel}</span>
          </span>
          {remaining != null ? (
            <span className="scan-notice-island-badge hidden shrink-0 px-2 py-0.5 text-[10px] sm:inline">
              余 {remaining}
            </span>
          ) : null}
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-[var(--scan-notice-ink)] transition-transform ${panelOpen ? "rotate-90" : "group-hover:translate-x-0.5"}`}
          />
        </button>
      </div>

      {createPortal(
        <div className={noticeThemeShell}>
          {panelOpen ? (
            <ScanNoticeDoodleCard
              kind={kind}
              titleId={meta.titleId}
              title={dialogHeadline || meta.dialogCategory}
              categoryLabel={meta.dialogCategory}
              icon={PanelIcon}
              bodyHtml={safeHtml}
              emptyHint={meta.emptyBodyHint}
              imageUrls={kind === "announcement" ? [] : images}
              imageAlt={meta.imageAlt}
              pageIndex={pageIndex}
              totalPages={kind === "announcement" ? announcementTotal : 1}
              statusSlot={
                <>
                  {isViolation && remaining != null ? (
                    <span className="scan-doodle-card__status">剩余进入 {remaining} 次</span>
                  ) : null}
                  {locked ? (
                    <span className="scan-doodle-card__status scan-doodle-card__status--danger">禁止进入</span>
                  ) : null}
                </>
              }
              footerSlot={
                showInteractivePuzzle ? (
                  <InteractiveChallenge
                    phrase={interactivePhrase!}
                    onComplete={() => {
                      if (
                        kind === "announcement" ||
                        notice?.id == null ||
                        !targetUserId ||
                        interactiveSaving ||
                        interactiveDone
                      ) {
                        return;
                      }
                      setInteractiveSaving(true);
                      void ackViolationInteractivePermanent(notice.id, targetUserId)
                        .then((ack) => {
                          setInteractiveDone(true);
                          onInteractiveVerified?.({
                            violationId: ack.violationId,
                            enterLocked: ack.enterLocked,
                            interactiveChallengeVerified: ack.interactiveChallengeVerified,
                            violationExpired: ack.violationExpired,
                          });
                        })
                        .catch(() => {
                          setInteractiveDone(false);
                        })
                        .finally(() => setInteractiveSaving(false));
                    }}
                  />
                ) : interactiveBlockedByMethod ? (
                  <p className="text-[11px] text-center text-[var(--app-color-text-tertiary)] px-3 py-2">
                    该违规需由工作人员解除，请联系管理员
                  </p>
                ) : interactiveBlockedByLimit ? (
                  <p className="text-[11px] text-center text-[var(--app-color-feedback-danger)] px-3 py-2">
                    已达自助解禁上限，请联系工作人员解除
                  </p>
                ) : null
              }
              primaryLabel={
                kind === "announcement"
                  ? "知道了"
                  : showInteractivePuzzle
                    ? "请先完成上方验证"
                    : "已知悉，关闭"
              }
              primaryDisabled={showInteractivePuzzle}
              showPrimary={kind === "announcement" || !showEveryScan}
              onPrimary={kind === "announcement" ? closeAnnouncementViaHeader : acknowledge}
              onClose={kind === "announcement" ? closeAnnouncementViaHeader : closePanel}
              onPrev={
                kind === "announcement" && announcementTotal > 1
                  ? () => setPageIndex((i) => (i - 1 + announcementTotal) % announcementTotal)
                  : undefined
              }
              onNext={
                kind === "announcement" && announcementTotal > 1
                  ? () => setPageIndex((i) => (i + 1) % announcementTotal)
                  : undefined
              }
            />
          ) : null}
        </div>,
        document.body
      )}
    </>
  );
}
