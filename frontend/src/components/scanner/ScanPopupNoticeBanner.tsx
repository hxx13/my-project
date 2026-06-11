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
  NOTICE_ACCENT_GRADIENT,
  NOTICE_FOOTER_BORDER,
  NOTICE_ISLAND_BASE,
  VIOLATION_NOTICE_PANEL,
  resolveNoticeColors,
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
 * 无全屏遮罩；违规与未绑卡支持交互拼图验证。
 */
export function ScanPopupNoticeBanner(props: ScanPopupNoticeBannerProps) {
  const { kind, panelOpen: panelOpenProp, onPanelOpenChange, suppressAutoOpen = false } = props;
  const { theme } = useTheme();
  const isDark = theme.mode === "dark";
  const meta = resolveScanPopupNoticeMeta(kind);
  const nc = resolveNoticeColors(kind);
  const footerBorder = NOTICE_FOOTER_BORDER[kind];

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

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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
  }, [panelOpen, kind, announcementTotal, setPanelOpen]);

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

  const bodyHtmlSource =
    kind === "announcement"
      ? announcementCurrent?.contentHtml || ""
      : notice?.violationText || "";
  const safeHtml = useMemo(() => prepareAnnouncementHtml(bodyHtmlSource), [bodyHtmlSource]);

  const dialogHeadline =
    kind === "announcement" ? announcementCurrent?.title || "扫码公告" : meta.dialogCategory;

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
      <div className="flex min-w-[min(148px,30vw)] max-w-[420px] flex-1 basis-0 justify-center">
        <button
          type="button"
          onClick={() => (panelOpen ? closePanel() : openPanel())}
          className={`group flex w-full min-w-0 items-center gap-2 ${NOTICE_ISLAND_BASE} ${nc.bg} ${nc.border} px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-2.5`}
        >
          <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${nc.iconBg}`}>
            <Megaphone className={`h-4 w-4 ${nc.iconText}`} />
            {locked ? (
              <span
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--app-color-feedback-danger)] ring-2 ring-[var(--app-color-surface-page)]"
                aria-hidden
              />
            ) : null}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className={`block text-[11px] font-black uppercase tracking-[0.2em] ${nc.tag}`}>
              {meta.islandTag}
            </span>
            <span className="block truncate text-sm font-bold text-[var(--app-color-text-primary)]">
              {islandLabel}
            </span>
          </span>
          {remaining != null ? (
            <span
              className={`hidden shrink-0 rounded-full bg-[var(--app-color-surface-hover)] px-2 py-0.5 text-[10px] font-bold sm:inline ${nc.badge}`}
            >
              余 {remaining}
            </span>
          ) : null}
          <ChevronRight
            className={`h-4 w-4 shrink-0 ${nc.tag} transition-transform ${panelOpen ? "rotate-90" : "group-hover:translate-x-0.5"}`}
          />
        </button>
      </div>

      {createPortal(
        <div className={`${theme.className} ${isDark ? "dark" : ""}`}>
          <AnimatePresence>
            {panelOpen ? (
              <motion.div
                key={`${kind}-notice-backdrop`}
                role="presentation"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
                onClick={closePanel}
              >
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={meta.titleId}
                  initial={{ opacity: 0, scale: 0.97, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: 6 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className={`relative flex max-h-[min(90vh,780px)] w-full max-w-[min(92vw,36rem)] flex-col overflow-hidden ${VIOLATION_NOTICE_PANEL}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-[3px] rounded-t-[var(--app-radius-container)]"
                    style={{ background: NOTICE_ACCENT_GRADIENT[kind] }}
                  />

                  <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-5 sm:px-8 sm:pt-6">
                    <div className="min-w-0 pt-0.5">
                      <p className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${nc.tag}`}>
                        {meta.dialogCategory}
                      </p>
                      <p
                        id={meta.titleId}
                        className="mt-1 truncate text-sm font-semibold text-[var(--app-color-text-primary)]"
                      >
                        {dialogHeadline}
                      </p>
                      {kind === "announcement" && announcementTotal > 1 ? (
                        <p className="mt-1 text-[11px] text-[var(--app-color-text-tertiary)]">
                          第 {pageIndex + 1} 条 / 共 {announcementTotal} 条
                        </p>
                      ) : null}
                      {kind !== "announcement" && (locked || (isViolation && remaining != null)) ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {isViolation && remaining != null ? (
                            <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
                              剩余进入 {remaining} 次
                            </span>
                          ) : null}
                          {locked ? (
                            <span className="text-[11px] font-medium text-[var(--app-color-feedback-danger)]">
                              禁止进入
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={closePanel}
                      className="-mr-1 shrink-0 rounded-full p-1.5 text-[var(--app-color-text-tertiary)] transition-colors hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-secondary)]"
                      aria-label="关闭"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4 sm:px-10 sm:pb-10 sm:pt-6">
                    <div className="mx-auto flex w-full max-w-[34rem] flex-col items-center gap-8 sm:gap-10">
                      {safeHtml ? (
                        <div
                          className={`${SCAN_ANNOUNCEMENT_BODY_CLASS} w-full text-left text-[1.02rem] sm:text-[1.08rem] [&_p]:text-center [&_p]:text-[1.05rem] [&_p]:sm:text-[1.15rem]`}
                          dangerouslySetInnerHTML={{ __html: safeHtml }}
                        />
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
                              className="flex max-h-[min(32vh,280px)] items-center justify-center overflow-hidden rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-page)]/60 p-2"
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
                        <div className="w-full rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-page)]/50 px-4 py-6 sm:px-6">
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
                    <div
                      className={`flex shrink-0 items-center justify-between gap-2 border-t px-6 py-4 sm:px-8 ${footerBorder}`}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--app-color-text-secondary)] transition-colors hover:text-[var(--app-color-text-primary)]"
                        onClick={() =>
                          setPageIndex((i) => (i - 1 + announcementTotal) % announcementTotal)
                        }
                      >
                        <ChevronLeft className="h-4 w-4" />
                        上一条
                      </button>
                      <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
                        {pageIndex + 1} / {announcementTotal}
                      </span>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--app-color-text-secondary)] transition-colors hover:text-[var(--app-color-text-primary)]"
                        onClick={() => setPageIndex((i) => (i + 1) % announcementTotal)}
                      >
                        下一条
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}

                  {!showEveryScan ? (
                    <div className={`flex shrink-0 justify-center border-t px-6 py-4 sm:px-8 ${footerBorder}`}>
                      <button
                        type="button"
                        disabled={Boolean(interactivePhrase && !interactiveDone)}
                        onClick={acknowledge}
                        className={`text-[13px] font-medium transition-colors ${
                          interactivePhrase && !interactiveDone
                            ? "cursor-not-allowed text-[var(--app-color-text-tertiary)]"
                            : "text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-text-primary)]"
                        }`}
                      >
                        {interactivePhrase && !interactiveDone ? "请先完成上方验证" : "已知悉，关闭"}
                      </button>
                    </div>
                  ) : null}
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </>
  );
}
