import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Megaphone, X } from "lucide-react";
import type { StudentViolationNotice } from "@/api/types/scanner";
import { InteractiveChallenge } from "./InteractiveChallenge";
import { ackViolationInteractivePermanent } from "./twinViolationInteractive";
import {
  NOTICE_ISLAND_BASE,
  VIOLATION_NOTICE_PANEL,
  resolveNoticeColors,
} from "./scanPopupTheme";

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

function resolveLegacyTheme(kind: ViolationNoticeKind, locked: boolean) {
  const isViolation = kind === "violation";
  return {
    locked,
    dialogTitle: isViolation ? "违规通告" : "未绑卡提示",
    alertTag: isViolation ? "Alert" : "Unbound",
    imgAlt: isViolation ? "违规附图" : "未绑卡提示附图",
    lockedDot: "bg-[var(--app-color-feedback-danger)] ring-2 ring-[var(--app-color-surface-page)]",
    isViolation,
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
  const t = resolveLegacyTheme(kind, locked);
  const nc = resolveNoticeColors(kind === "violation" ? "violation" : "unbound");
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
          className={`group flex w-full min-w-0 items-center gap-2 ${NOTICE_ISLAND_BASE} ${nc.border} px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-2.5`}
        >
          <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${nc.iconBg}`}>
            <Megaphone className={`h-4 w-4 ${nc.iconText}`} />
            {locked ? (
              <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${t.lockedDot}`} aria-hidden />
            ) : null}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className={`block text-[11px] font-black uppercase tracking-[0.2em] ${nc.tag}`}>{t.alertTag}</span>
            <span className="block truncate text-sm font-bold text-[var(--app-color-text-primary)]">{islandLabel}</span>
          </span>
          {remaining != null ? (
            <span className={`hidden shrink-0 rounded-full bg-[var(--app-color-surface-hover)] px-2 py-0.5 text-[10px] font-bold sm:inline ${nc.badge}`}>
              余 {remaining}
            </span>
          ) : null}
          <ChevronRight
            className={`h-4 w-4 shrink-0 ${nc.tag} transition-transform ${panelOpen ? "rotate-90" : "group-hover:translate-x-0.5"}`}
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
              className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
              onClick={closePanel}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                initial={{ opacity: 0, scale: 0.97, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 6 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className={`relative flex max-h-[min(90vh,780px)] w-full max-w-[min(92vw,36rem)] flex-col overflow-hidden ${VIOLATION_NOTICE_PANEL}`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 顶部按类型着色装饰条 */}
                <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-[var(--app-radius-container)]"
                     style={{background: kind === "violation" ? "linear-gradient(90deg,#fbbf24,#f59e0b)" : "linear-gradient(90deg,#fb923c,#f97316)"}} />

                {/* 顶栏：极轻量，不抢正文 */}
                <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-5 sm:px-8 sm:pt-6">
                  <div className="min-w-0 pt-0.5">
                    <p id={titleId} className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${nc.tag}`}>
                      {t.dialogTitle}
                    </p>
                    {locked || (isViolation && remaining != null) ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {isViolation && remaining != null ? (
                          <span className="text-[11px] text-[var(--app-color-text-tertiary)]">剩余进入 {remaining} 次</span>
                        ) : null}
                        {locked ? (
                          <span className="text-[11px] font-medium text-[var(--app-color-feedback-danger)]">禁止进入</span>
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

                {/* 正文区：留白优先，文字为视觉重心 */}
                <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4 sm:px-10 sm:pb-10 sm:pt-6">
                  <div className="mx-auto flex w-full max-w-[34rem] flex-col items-center gap-8 sm:gap-10">
                    {text ? (
                      <p className="w-full whitespace-pre-wrap break-words text-center text-[1.05rem] font-medium leading-[1.85] tracking-[0.01em] text-[var(--app-color-text-primary)] sm:text-[1.2rem] sm:leading-[1.9]">
                        {text}
                      </p>
                    ) : imgCount === 0 && !(interactivePhrase && !interactiveDone) ? (
                      <p className="text-center text-sm leading-relaxed text-[var(--app-color-text-tertiary)]">
                        未填写文字说明，请查看附图或联系管理员。
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
                              alt={isViolation ? "违规附图" : "未绑卡提示附图"}
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

                {!notice.showNoticeEveryScan ? (
                  <div className={`flex shrink-0 justify-center ${kind === "violation" ? "border-amber-200 dark:border-amber-800/30" : "border-orange-200 dark:border-orange-800/30"} border-t px-6 py-4 sm:px-8`}>
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
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
