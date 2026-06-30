import { useCallback, useRef, useState, useEffect, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";
import { SCAN_ANNOUNCEMENT_BODY_CLASS } from "@/utils/announcementHtml";
import { PageHelpImageLightbox } from "@/features/page-help/PageHelpImageLightbox";
import { useRichTextImageLightbox } from "@/components/rich-text/useRichTextImageLightbox";
import type { NoticeKind } from "./scanPopupTheme";

export type ScanNoticeDoodleCardProps = {
  kind: NoticeKind;
  titleId: string;
  title: string;
  categoryLabel: string;
  icon: LucideIcon;
  bodyHtml: string;
  emptyHint: string;
  imageUrls?: string[];
  imageAlt?: string;
  pageIndex: number;
  totalPages: number;
  statusSlot?: ReactNode;
  footerSlot?: ReactNode;
  primaryLabel: string;
  primaryDisabled?: boolean;
  showPrimary?: boolean;
  onPrimary: () => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** 次按钮：如「下次不再弹出」 */
  secondaryLabel?: string;
  secondaryDisabled?: boolean;
  showSecondary?: boolean;
  onSecondary?: () => void;
  /** 递增时触发与点 ✕ 相同的退出动画并调用 onClose */
  externalCloseTick?: number;
  /** 并排批量展示时缩小卡片，不撑满屏宽 */
  compact?: boolean;
  /** 嵌入批量布局槽位：不包 fixed 全屏 anchor */
  embedded?: boolean;
};

function imageGridClass(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "grid grid-cols-1 place-items-center w-full";
  if (count === 2) return "grid grid-cols-2 gap-2 w-full";
  return "grid grid-cols-2 sm:grid-cols-3 gap-2 w-full";
}

/** 退出态：轻量位移 + 淡出，避免大幅 scale 导致大卡片栅格化卡顿 */
const CARD_EXIT = { scale: 0.97, opacity: 0, y: 10 } as const;
const CARD_ENTER = { scale: 1, opacity: 1, y: 0 } as const;

const CARD_EXIT_TRANSITION = {
  type: "tween" as const,
  duration: 0.26,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

const CARD_EXIT_TRANSITION_REDUCED = {
  type: "tween" as const,
  duration: 0.12,
  ease: "easeOut" as const,
};

export function ScanNoticeDoodleCard({
  kind,
  titleId,
  title,
  categoryLabel,
  icon: Icon,
  bodyHtml,
  emptyHint,
  imageUrls = [],
  imageAlt = "附图",
  pageIndex,
  totalPages,
  statusSlot,
  footerSlot,
  primaryLabel,
  primaryDisabled = false,
  showPrimary = true,
  onPrimary,
  onClose,
  onPrev,
  onNext,
  secondaryLabel,
  secondaryDisabled = false,
  showSecondary = false,
  onSecondary,
  externalCloseTick = 0,
  compact = false,
  embedded = false,
}: ScanNoticeDoodleCardProps) {
  const reduceMotion = useReducedMotion();
  const [exiting, setExiting] = useState(false);
  const exitDoneRef = useRef(false);
  const imgCount = imageUrls.length;
  const { containerRef, lightbox, closeLightbox } = useRichTextImageLightbox([
    bodyHtml,
    imageUrls.join("|"),
  ]);

  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const beginExit = useCallback(
    (action: () => void) => {
      if (exiting) return;
      exitDoneRef.current = false;
      setPendingAction(() => action);
      setExiting(true);
    },
    [exiting]
  );

  const handleCloseClick = () => beginExit(onClose);

  const handlePrimaryClick = () => {
    if (primaryDisabled || exiting) return;
    beginExit(onPrimary);
  };

  const handleExitComplete = () => {
    pendingAction?.();
    setPendingAction(null);
  };

  useEffect(() => {
    if (!externalCloseTick) return;
    if (exiting) return;
    beginExit(onClose);
  }, [externalCloseTick, exiting, onClose, beginExit]);

  const exitTransition = reduceMotion ? CARD_EXIT_TRANSITION_REDUCED : CARD_EXIT_TRANSITION;

  const card = (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      initial={false}
      className={`scan-doodle-card scan-doodle-card--${kind} flex flex-col${compact ? " scan-doodle-card--compact" : ""}${exiting ? " scan-doodle-card--exiting" : ""}`}
      animate={exiting ? CARD_EXIT : CARD_ENTER}
      transition={exiting ? exitTransition : { duration: 0 }}
      onAnimationComplete={() => {
        if (!exiting || exitDoneRef.current) return;
        exitDoneRef.current = true;
        handleExitComplete();
      }}
    >
        <button
          type="button"
          className="scan-doodle-card__close"
          onClick={handleCloseClick}
          aria-label="关闭"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>

        <span className="scan-doodle-card__corner-icon" aria-hidden>
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>

        <svg className="scan-doodle-deco scan-doodle-deco--star" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2L15 9L22 10L17 15L18.5 22L12 18.5L5.5 22L7 15L2 10L9 9L12 2Z" />
        </svg>
        <svg className="scan-doodle-deco scan-doodle-deco--sparkle" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 0C12 6.6 17.4 12 24 12C17.4 12 12 17.4 12 24C12 17.4 6.6 12 0 12C6.6 12 12 6.6 12 0Z" />
        </svg>
        <svg className="scan-doodle-deco scan-doodle-deco--swirl" viewBox="0 0 100 100" aria-hidden>
          <path d="M50 10C27.9 10 10 27.9 10 50C10 72.1 27.9 90 50 90C72.1 90 90 72.1 90 50C90 32.3 75.7 18 58 18C44.3 18 33 29.3 33 43C33 53.5 41.5 62 52 62C59.7 62 66 55.7 66 48" />
        </svg>

        <div className="scan-doodle-card__head">
          <div id={titleId} className="scan-doodle-card__title">
            {title}
          </div>
          <div className="scan-doodle-card__meta">
            <span className="scan-doodle-card__badge">{categoryLabel}</span>
            {statusSlot}
          </div>
          {totalPages > 1 ? (
            <div className="scan-doodle-card__pager" aria-hidden>
              {Array.from({ length: totalPages }, (_, i) => (
                <span
                  key={i}
                  className={`scan-doodle-card__dot ${i === pageIndex ? "scan-doodle-card__dot--active" : ""}`}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div ref={containerRef} className="scan-doodle-card__body app-themed-scrollbar" data-modal-scroll>
          {bodyHtml ? (
            <div
              className={SCAN_ANNOUNCEMENT_BODY_CLASS}
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : imgCount === 0 && !footerSlot ? (
            <p className="scan-doodle-card__empty">{emptyHint}</p>
          ) : null}

          {imgCount > 0 ? (
            <div className={`scan-doodle-card__images ${imageGridClass(imgCount)}`}>
              {imageUrls.map((src) => (
                <div key={src} className="scan-doodle-card__image-frame">
                  <img
                    src={src}
                    alt={imageAlt}
                    className="scan-doodle-card__image scan-doodle-card__image--zoomable"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {footerSlot ? <div className="scan-doodle-card__footer-slot">{footerSlot}</div> : null}

        <div className="scan-doodle-card__actions">
          {totalPages > 1 ? (
            <>
              <button type="button" className="scan-doodle-card__btn scan-doodle-card__btn--nav" onClick={onPrev}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="scan-doodle-card__counter">
                {pageIndex + 1} / {totalPages}
              </span>
              <button type="button" className="scan-doodle-card__btn scan-doodle-card__btn--nav" onClick={onNext}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          ) : null}
          {showPrimary ? (
            <button
              type="button"
              className="scan-doodle-card__btn scan-doodle-card__btn--primary"
              disabled={primaryDisabled || exiting}
              onClick={handlePrimaryClick}
            >
              {primaryLabel}
            </button>
          ) : null}
          {showSecondary && secondaryLabel ? (
            <button
              type="button"
              className="scan-doodle-card__btn scan-doodle-card__btn--secondary"
              disabled={secondaryDisabled || exiting}
              onClick={() => {
                if (secondaryDisabled || exiting) return;
                onSecondary?.();
              }}
            >
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      </motion.div>
  );

  if (embedded) {
    return (
      <>
        {card}
        {lightbox ? (
          <PageHelpImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={closeLightbox} />
        ) : null}
      </>
    );
  }

  return (
    <div className="scan-notice-doodle-anchor scan-notice-doodle-anchor--with-scrim" data-modal-layer="true">
      <div className="scan-notice-scrim scan-notice-scrim--blocking" aria-hidden />
      {card}
      {lightbox ? (
        <PageHelpImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={closeLightbox} />
      ) : null}
    </div>
  );
}
