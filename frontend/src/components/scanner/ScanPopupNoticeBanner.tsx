import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Megaphone, X } from "lucide-react";
import type { ScanPopupAnnouncementBundle, StudentViolationNotice } from "@/api/types/scanner";
import { prepareAnnouncementHtml, SCAN_ANNOUNCEMENT_BODY_CLASS } from "@/utils/announcementHtml";
import { useTheme } from "@/features/theme/ThemeProvider";
import { InteractiveChallenge } from "./InteractiveChallenge";
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

function imageGridClass(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "grid grid-cols-1 place-items-center max-w-2xl mx-auto w-full";
  if (count === 2) return "grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-3xl mx-auto";
  if (count <= 4) return "grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-4xl mx-auto";
  return "grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 w-full max-w-5xl mx-auto";
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
  const [interactiveDone, setInteractiveDone] = useState(
    Boolean(kind !== "announcement" && notice?.interactiveChallengeVerified)
  );
  const [interactiveSaving, setInteractiveSaving] = useState(false);
  const prevRecordIdRef = useRef<number | null | undefined>(null);

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
    if (interactivePhrase && !interactiveDone) return;
    try {
      sessionStorage.setItem(noticeAckKey(kind, recordId), "1");
    } catch {
      /* ignore */
    }
    setPanelOpen(false);
  }, [recordId, showEveryScan, interactivePhrase, interactiveDone, kind, setPanelOpen]);

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

  const imgCount = images.length;
  const targetUserId = kind === "announcement" ? undefined : props.targetUserId;
  const onInteractiveVerified = kind === "announcement" ? undefined : props.onInteractiveVerified;

  return (
    <>
      <div className={`flex min-w-[min(128px,28vw)] max-w-[360px] flex-1 basis-0 justify-center ${noticeThemeShell}`}>
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
            <Megaphone className="h-3.5 w-3.5" />
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
          <AnimatePresence>
            {panelOpen ? (
              <motion.div
                key={`${kind}-notice-panel`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={meta.titleId}
                initial={{ opacity: 0, scale: 0.96, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 8 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="scan-notice-panel fixed inset-0 z-[var(--z-modal)] m-auto flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                  <div className="scan-notice-panel-accent" aria-hidden />

                  <div className="scan-notice-header">
                    <div className="scan-notice-header-main">
                      <span id={meta.titleId} className="scan-notice-category-pill shrink-0">
                        {meta.dialogCategory}
                      </span>
                      {dialogHeadline ? (
                        <p className="scan-notice-dialog-title">{dialogHeadline}</p>
                      ) : null}
                      {kind === "announcement" && announcementTotal > 1 ? (
                        <span className="scan-notice-status-pill shrink-0">
                          第 {pageIndex + 1} 条 / 共 {announcementTotal} 条
                        </span>
                      ) : null}
                      {kind !== "announcement" && isViolation && remaining != null ? (
                        <span className="scan-notice-status-pill shrink-0">剩余进入 {remaining} 次</span>
                      ) : null}
                      {kind !== "announcement" && locked ? (
                        <span className="scan-notice-status-pill scan-notice-status-pill--danger shrink-0">
                          禁止进入
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={announcementCloseViaButtonOnly ? closeAnnouncementViaHeader : closePanel}
                      className="scan-notice-close-btn shrink-0 p-1.5"
                      aria-label="关闭"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="app-themed-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6">
                    <div className="mx-auto flex w-full max-w-[42rem] flex-col items-center gap-6 sm:gap-8">
                      {safeHtml ? (
                        <div className="scan-notice-body-card w-full p-5 sm:p-6">
                          <div
                            className={`${SCAN_ANNOUNCEMENT_BODY_CLASS} w-full text-left text-[1.02rem] sm:text-[1.08rem] [&_p]:text-center [&_p]:text-[1.05rem] [&_p]:sm:text-[1.15rem]`}
                            dangerouslySetInnerHTML={{ __html: safeHtml }}
                          />
                        </div>
                      ) : imgCount === 0 && !(interactivePhrase && !interactiveDone) ? (
                        <p className="text-center text-sm leading-relaxed text-[var(--app-color-text-tertiary)]">
                          {meta.emptyBodyHint}
                        </p>
                      ) : null}

                      {imgCount > 0 ? (
                        <div className={`w-full ${imageGridClass(imgCount)}`}>
                          {images.map((src) => (
                            <div
                              key={src}
                              className="scan-notice-body-card flex max-h-[min(32vh,280px)] items-center justify-center overflow-hidden p-2"
                            >
                              <img
                                src={src}
                                alt={meta.imageAlt}
                                className="max-h-[min(32vh,280px)] w-full object-contain"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {interactivePhrase && !interactiveDone ? (
                        <div className="scan-notice-body-card w-full px-4 py-6 sm:px-6">
                          <InteractiveChallenge
                            phrase={interactivePhrase}
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
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {kind === "announcement" && announcementTotal > 1 ? (
                    <div className="scan-notice-footer justify-between gap-2">
                      <button
                        type="button"
                        className="scan-notice-btn"
                        onClick={() =>
                          setPageIndex((i) => (i - 1 + announcementTotal) % announcementTotal)
                        }
                      >
                        <ChevronLeft className="h-4 w-4" />
                        上一条
                      </button>
                      <span className="scan-notice-status-pill">
                        {pageIndex + 1} / {announcementTotal}
                      </span>
                      <button
                        type="button"
                        className="scan-notice-btn"
                        onClick={() => setPageIndex((i) => (i + 1) % announcementTotal)}
                      >
                        下一条
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}

                  {!showEveryScan && !announcementCloseViaButtonOnly ? (
                    <div className="scan-notice-footer justify-center">
                      <button
                        type="button"
                        disabled={Boolean(interactivePhrase && !interactiveDone)}
                        onClick={acknowledge}
                        className="scan-notice-btn scan-notice-btn--primary min-w-[9.5rem]"
                      >
                        {interactivePhrase && !interactiveDone ? "请先完成上方验证" : "已知悉，关闭"}
                      </button>
                    </div>
                  ) : null}
                </motion.div>
            ) : null}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </>
  );
}
