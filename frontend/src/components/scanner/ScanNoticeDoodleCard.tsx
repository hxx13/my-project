import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
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
};

function imageGridClass(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "grid grid-cols-1 place-items-center w-full";
  if (count === 2) return "grid grid-cols-2 gap-2 w-full";
  return "grid grid-cols-2 sm:grid-cols-3 gap-2 w-full";
}

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
}: ScanNoticeDoodleCardProps) {
  const [exiting, setExiting] = useState(false);
  const imgCount = imageUrls.length;
  const { containerRef, lightbox, closeLightbox } = useRichTextImageLightbox([
    bodyHtml,
    imageUrls.join("|"),
  ]);

  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const handleCloseClick = () => {
    if (exiting) return;
    setPendingAction(() => onClose);
    setExiting(true);
  };

  const handlePrimaryClick = () => {
    if (primaryDisabled || exiting) return;
    onPrimary();
  };

  const handleExitComplete = () => {
    pendingAction?.();
    setPendingAction(null);
  };

  return (
    <div className="scan-notice-doodle-anchor" data-modal-layer="true">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`scan-doodle-card scan-doodle-card--${kind} flex flex-col`}
        animate={
          exiting
            ? { scale: 0.12, opacity: 0, y: 24 }
            : { scale: 1, opacity: 1, y: 0 }
        }
        transition={
          exiting
            ? { duration: 0.38, ease: [0.4, 0, 0.85, 1] }
            : { duration: 0 }
        }
        onAnimationComplete={() => {
          if (exiting) handleExitComplete();
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
        </div>
      </motion.div>
      {lightbox ? (
        <PageHelpImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={closeLightbox} />
      ) : null}
    </div>
  );
}
