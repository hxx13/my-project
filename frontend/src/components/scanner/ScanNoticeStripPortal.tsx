import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { LayoutGroup } from "framer-motion";
import { shouldShowCloseAllButton } from "./scanNoticePanelId";

type Props = {
  open: boolean;
  /** 公告层面板数（决定并排宽度档位） */
  panelCount: number;
  /** 交互层面板数；>0 时作为独立一层浮在公告层之上 */
  interactiveCount?: number;
  /** 交互层变体：signature 时再放宽一档（手写签名要横向空间） */
  interactiveVariant?: "signature";
  onCloseAll: () => void;
  /** 公告层 */
  children: ReactNode;
  /** 交互层（需要用户动手的违规面板）；独立浮层，**不占公告层位置** */
  interactiveChildren?: ReactNode;
};

/**
 * 通告分「图层」展示：
 * - 交互层：需要处置的违规面板独占整屏（此时调用方把公告层数量传 0，公告卡不渲染），
 *   尺寸完全由自己定 —— 拼图 / 答题 / 签名都拿得到地方
 * - 公告层：其余通知按数量并排居中（`--2` / `--3` / `--many` 档）
 *
 * 处置完成后面板自动落回公告层（判据见 `noticeLayer.ts`），交互层消失、公告卡照常出现。
 */
export function ScanNoticeStripPortal({
  open,
  panelCount,
  interactiveCount = 0,
  interactiveVariant,
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
      {/* 这一层只用来给交互层当定位锚点：公告层仍是根容器里居中的唯一流内元素，
          所以公告的位置和分层前完全一致 */}
      <div className="scan-notice-strip-anchor">
        {interactiveCount > 0 ? (
          <div
            className={`scan-notice-strip-layer${interactiveVariant === "signature" ? " scan-notice-strip-layer--signature" : ""}`}
            role="group"
            aria-label="待处置通知"
          >
            <LayoutGroup id="scan-notice-strip-interactive">{interactiveChildren}</LayoutGroup>
          </div>
        ) : null}
        {panelCount > 0 ? (
          <div className="scan-notice-strip-scroll scan-notice-strip-scroll--themed">
            <LayoutGroup id="scan-notice-strip">
              <div className={`scan-notice-strip-row ${rowLayoutClass}`}>{children}</div>
            </LayoutGroup>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
