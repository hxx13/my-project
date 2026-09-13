import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { LayoutGroup } from "framer-motion";
import { shouldShowCloseAllButton } from "./scanNoticePanelId";

type Props = {
  open: boolean;
  /** 公告层面板数（决定并排宽度档位） */
  panelCount: number;
  /** 交互层面板数；>0 时单独占一行，按 --1 档拿全宽 */
  interactiveCount?: number;
  onCloseAll: () => void;
  /** 公告层 */
  children: ReactNode;
  /** 交互层（需要用户动手的违规面板）；独占一行，宽度不受公告层数量影响 */
  interactiveChildren?: ReactNode;
};

/**
 * 通告分层展示：
 * - 交互层：需要处置的违规面板独占一行、拿满宽（`--1` 档 612px），拼图 / 答题 / 签名才有地方
 * - 公告层：其余通知按数量并排（`--2` / `--3` / `--many` 档）
 *
 * 处置完成后面板自动落回公告层（判据见 `noticeLayer.ts`），交互层那一行随之消失。
 */
export function ScanNoticeStripPortal({
  open,
  panelCount,
  interactiveCount = 0,
  onCloseAll,
  children,
  interactiveChildren,
}: Props) {
  const total = panelCount + interactiveCount;
  if (!open || total === 0) return null;

  const rowLayoutClass =
    panelCount > 3
      ? "scan-notice-strip-row--many"
      : `scan-notice-strip-row--${panelCount}`;

  return createPortal(
    <div className="scan-notice-strip-root" data-modal-layer="true">
      <div className="scan-notice-scrim scan-notice-scrim--blocking scan-notice-strip-root__scrim" aria-hidden />
      {shouldShowCloseAllButton(total) ? (
        <button type="button" className="scan-notice-strip-close-all" onClick={onCloseAll}>
          全部关闭
        </button>
      ) : null}
      <div className="scan-notice-strip-scroll scan-notice-strip-scroll--themed">
        <LayoutGroup id="scan-notice-strip">
          {interactiveCount > 0 ? (
            <div className="scan-notice-strip-row scan-notice-strip-row--1">{interactiveChildren}</div>
          ) : null}
          {panelCount > 0 ? (
            <div className={`scan-notice-strip-row ${rowLayoutClass}`}>{children}</div>
          ) : null}
        </LayoutGroup>
      </div>
    </div>,
    document.body
  );
}
