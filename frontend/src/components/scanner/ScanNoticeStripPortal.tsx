import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { LayoutGroup } from "framer-motion";
import { shouldShowCloseAllButton } from "./scanNoticePanelId";

type Props = {
  open: boolean;
  panelCount: number;
  onCloseAll: () => void;
  children: ReactNode;
};

/**
 * 通告横向平铺；超出视口时显示主题化横向滚动条。
 * 4 张及以上与 3 张同尺寸，保证一屏完整显示 3 张。
 */
export function ScanNoticeStripPortal({ open, panelCount, onCloseAll, children }: Props) {
  if (!open || panelCount === 0) return null;

  const rowLayoutClass =
    panelCount > 3
      ? "scan-notice-strip-row--many"
      : `scan-notice-strip-row--${panelCount}`;

  return createPortal(
    <div className="scan-notice-strip-root" data-modal-layer="true">
      <div className="scan-notice-scrim scan-notice-scrim--blocking scan-notice-strip-root__scrim" aria-hidden />
      {shouldShowCloseAllButton(panelCount) ? (
        <button type="button" className="scan-notice-strip-close-all" onClick={onCloseAll}>
          全部关闭
        </button>
      ) : null}
      <div className="scan-notice-strip-scroll scan-notice-strip-scroll--themed">
        <LayoutGroup id="scan-notice-strip">
          <div className={`scan-notice-strip-row ${rowLayoutClass}`}>{children}</div>
        </LayoutGroup>
      </div>
    </div>,
    document.body
  );
}
