import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Megaphone, X } from "lucide-react";
import type { StudentViolationNotice } from "@/api/types/scanner";
import { InteractiveChallenge } from "./InteractiveChallenge";
import { ackViolationInteractivePermanent } from "./twinViolationInteractive";

export type ViolationNoticeKind = "violation" | "unbound";

const ackKey = (kind: ViolationNoticeKind, id: number) =>
  kind === "unbound" ? "twin_unbound_card_notice_ack" : `twin_violation_notice_ack_${id}`;

type Props = {
  notice: StudentViolationNotice | undefined | null;
  kind?: ViolationNoticeKind;
  /** 违规人员 userId，交互确认写库时校验 */
  targetUserId?: string;
  /** 交互拼图永久确认成功后回调（合并 analyze，禁止整表 refresh） */
  onInteractiveVerified?: (patch: {
    violationId: number;
    enterLocked: boolean;
    interactiveChallengeVerified: boolean;
    violationExpired?: boolean;
  }) => void;
  /** 由 ScanPopupNoticeCoordinator 统一调度，避免多弹窗互相覆盖 */
  panelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
  suppressAutoOpen?: boolean;
};

function resolveTheme(kind: ViolationNoticeKind, locked: boolean) {
  const accentVar = kind === "violation"
    ? "var(--app-color-feedback-warning)"
    : "var(--app-color-feedback-info)";
  const panelAccent = kind === "violation"
    ? "var(--app-color-feedback-warning)"
    : "var(--app-color-feedback-info)";
  return {
    islandBorder: locked
      ? "border-[var(--app-color-feedback-danger)]/50 bg-[var(--app-color-feedback-danger)]/5"
      : `border-[${panelAccent}]/30 bg-[var(--app-color-surface-container)]/90`,
    iconRing: `bg-[${accentVar}]/10 ring-1 ring-[${accentVar}]/20`,
    icon: `text-[${accentVar}]`,
    chevron: "text-[var(--app-color-text-tertiary)]",
    badge: "text-[var(--app-color-text-primary)]",
    tag: "text-[var(--app-color-text-tertiary)]",
    panelBorder: "border-[var(--app-color-border-default)]",
    panelBg: "bg-[var(--app-color-surface-container)]",
    headerBorder: "border-[var(--app-color-border-default)]",
    title: "text-[var(--app-color-text-primary)]",
    meta: "text-[var(--app-color-text-tertiary)]",
    btnBorder: "border-[var(--app-color-border-default)]",
    btnText: "text-[var(--app-color-text-secondary)]",
    closeBtn: "text-[var(--app-color-text-tertiary)]",
    textBorder: "border-[var(--app-color-border-default)]",
    textBody: "text-[var(--app-color-text-primary)]",
    emptyHint: "text-[var(--app-color-text-tertiary)]",
    dialogTitle: kind === "violation" ? "违规通告" : "未绑卡提示",
    alertTag: kind === "violation" ? "Alert" : "Unbound",
    imgAlt: kind === "violation" ? "违规附图" : "未绑卡提示附图",
    lockedDot: "bg-[var(--app-color-feedback-danger)] ring-2 ring-black/80",
  };
}

/** 根据张数选择列数，保证单张居中、多张均匀 */
function imageGridClass(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "grid grid-cols-1 place-items-center max-w-2xl mx-auto w-full";
  if (count === 2) return "grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-3xl mx-auto";
  if (count <= 4) return "grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-4xl mx-auto";
  return "grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 w-full max-w-5xl mx-auto";
}

function readAcked(kind: ViolationNoticeKind, id: number): boolean {
  try {
    return sessionStorage.getItem(ackKey(kind, id)) === "1";
  } catch {
    return false;
  }
}

export function ViolationNoticeBanner({
  notice,
  kind = "violation",
  targetUserId,
  onInteractiveVerified,
  panelOpen: panelOpenProp,
  onPanelOpenChange,
  suppressAutoOpen = false,
}: Props) {
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
  const isViolation = kind === "violation";

  useEffect(() => {
    if (suppressAutoOpen || controlled || !notice?.id) return;
    setPanelOpenInternal(Boolean(notice.showNoticeEveryScan));
  }, [suppressAutoOpen, controlled, notice?.id, notice?.showNoticeEveryScan]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panelOpen, setPanelOpen]);

  const images = useMemo(() => {
    if (!notice?.imageUrls?.length) return [];
    return notice.imageUrls.filter((u) => typeof u === "string" && u.trim().length > 0);
  }, [notice?.imageUrls]);

  const interactivePhrase = notice?.interactiveChallenge || null;
  const [interactiveDone, setInteractiveDone] = useState(Boolean(notice?.interactiveChallengeVerified));
  const [interactiveSaving, setInteractiveSaving] = useState(false);
  const prevNoticeIdRef = useRef<number | null | undefined>(null);
  useEffect(() => {
    if (notice?.id !== prevNoticeIdRef.current) {
      prevNoticeIdRef.current = notice?.id;
      setInteractiveDone(Boolean(notice?.interactiveChallengeVerified));
    } else if (notice?.interactiveChallengeVerified) {
      setInteractiveDone(true);
    }
  }, [notice?.id, notice?.interactiveChallengeVerified]);

  const acknowledge = useCallback(() => {
    if (!notice?.id || notice.showNoticeEveryScan) return;
    if (interactivePhrase && !interactiveDone) return;
    try {
      sessionStorage.setItem(ackKey(kind, notice.id), "1");
    } catch {
      /* ignore */
    }
    setPanelOpen(false);
  }, [kind, notice?.id, notice?.showNoticeEveryScan, setPanelOpen, interactivePhrase, interactiveDone]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
  }, [setPanelOpen]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
  }, [setPanelOpen]);

  if (notice?.id == null) return null;

  const text = (notice.violationText || "").trim();
  const locked = Boolean(notice.enterLocked);
  const t = resolveTheme(kind, locked);
  const remaining = isViolation ? notice.remainingEnterAllowance : undefined;
  const imgCount = images.length;

  const sessionAcked = !notice.showNoticeEveryScan && readAcked(kind, notice.id);
  const islandLabel = interactivePhrase
    ? interactiveDone
      ? "交互验证 · 已完成"
      : `🧩 ${panelOpen ? "请完成验证" : "交互验证 · 点我"}`
    : sessionAcked
      ? isViolation
        ? "违规记录（已知晓）"
        : "未绑卡（已知晓）"
      : panelOpen
        ? "详情已展开 · 点我收起"
        : notice.showNoticeEveryScan
          ? isViolation
            ? "违规警示 · 点我"
            : "未绑卡警示 · 点我"
          : isViolation
            ? "违规通告 · 点我查看"
            : "未绑卡提示 · 点我查看";

  const titleId = kind === "unbound" ? "unbound-notice-title" : "violation-notice-title";

  return (
    <>
      <div className="flex min-w-[min(148px,30vw)] max-w-[420px] flex-1 basis-0 justify-center">
        <button
          type="button"
          onClick={() => (panelOpen ? closePanel() : openPanel())}
          className={`group flex w-full min-w-0 items-center gap-2 rounded-[999px] border px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-transform active:scale-[0.98] sm:gap-2.5 sm:px-4 sm:py-2.5 ${t.islandBorder}`}
        >
          <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${t.iconRing}`}>
            <Megaphone className={`h-4 w-4 ${t.icon}`} />
            {locked ? (
              <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${t.lockedDot}`} aria-hidden />
            ) : null}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className={`block text-[11px] font-black uppercase tracking-[0.2em] ${t.tag}`}>{t.alertTag}</span>
            <span className="block truncate text-sm font-bold text-[var(--app-color-text-primary)]">{islandLabel}</span>
          </span>
          {remaining != null ? (
            <span className={`hidden shrink-0 rounded-full bg-[var(--app-color-surface-hover)] px-2 py-0.5 text-[10px] font-bold sm:inline ${t.badge}`}>
              余 {remaining}
            </span>
          ) : null}
          <ChevronRight
            className={`h-4 w-4 shrink-0 transition-transform ${t.chevron} ${panelOpen ? "rotate-90" : "group-hover:translate-x-0.5"}`}
          />
        </button>
      </div>

      {createPortal(
        <AnimatePresence>
          {panelOpen ? (
            <motion.div
              key={`${kind}-backdrop`}
              role="presentation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[100130] flex items-center justify-center bg-black/40 p-4 backdrop-blur-md"
              onClick={closePanel}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className={`relative flex max-h-[min(88vh,720px)] w-full max-w-[min(96vw,640px)] flex-col overflow-hidden rounded-[var(--app-radius-container)] border ${t.panelBorder} ${t.panelBg} shadow-[var(--app-elevation-modal)]`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`flex shrink-0 items-center justify-between gap-3 border-b ${t.headerBorder} px-4 py-3`}>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Megaphone className={`h-5 w-5 shrink-0 ${t.icon}`} />
                    <div className="min-w-0">
                      <div id={titleId} className={`text-sm font-black tracking-wide ${t.title}`}>
                        {t.dialogTitle}
                      </div>
                      {locked || (isViolation && remaining != null) ? (
                        <div className={`mt-0.5 flex flex-wrap items-center gap-2 text-[11px] ${t.meta}`}>
                          {isViolation && remaining != null ? <span>剩余进入次数：{remaining}</span> : null}
                          {locked ? <span className="font-bold text-[var(--app-color-feedback-danger)]">禁止进入</span> : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!notice.showNoticeEveryScan ? (
                      <button
                        type="button"
                        disabled={Boolean(interactivePhrase && !interactiveDone)}
                        onClick={acknowledge}
                        className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-opacity ${
                          interactivePhrase && !interactiveDone
                            ? "border-[var(--app-color-border-default)] text-amber-200/30 cursor-not-allowed"
                            : `hover:bg-[var(--app-color-surface-hover)] ${t.btnBorder} ${t.btnText}`
                        }`}
                      >
                        {interactivePhrase && !interactiveDone ? "请先完成验证" : "已知悉"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={closePanel}
                      className={`rounded-full p-2 hover:bg-[var(--app-color-surface-hover)] ${t.closeBtn}`}
                      aria-label="关闭"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4">
                    {imgCount > 0 ? (
                      <div className={`w-full ${imageGridClass(imgCount)}`}>
                        {images.map((src) => (
                          <div
                            key={src}
                            className="flex max-h-[min(38vh,320px)] items-center justify-center overflow-hidden rounded-2xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)]/50 p-1"
                          >
                            <img
                              src={src}
                              alt={t.imgAlt}
                              className="max-h-[min(38vh,320px)] w-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {text ? (
                      <p
                        className={`w-full max-w-2xl rounded-2xl border bg-[var(--app-color-surface-page)] p-4 text-center text-sm leading-relaxed whitespace-pre-wrap break-words ${t.textBorder} ${t.textBody}`}
                      >
                        {text}
                      </p>
                    ) : imgCount === 0 && !(interactivePhrase && !interactiveDone) ? (
                      <p className={`text-center text-xs ${t.emptyHint}`}>未填写文字说明，请查看附图或联系管理员。</p>
                    ) : null}
                    {interactivePhrase && !interactiveDone ? (
                      <div className={`w-full max-w-2xl rounded-2xl border bg-[var(--app-color-surface-page)] p-5 ${t.textBorder}`}>
                        <InteractiveChallenge
                          phrase={interactivePhrase}
                          onComplete={() => {
                            if (!notice?.id || !targetUserId || interactiveSaving || interactiveDone) return;
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
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
