import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { ScanAssistantMessageKind } from "@/store/useScanAssistantStore";
import type { BubblePlacement } from "./computeBubblePlacement";
import type { ScanAssistantBubblePhase } from "./useScanAssistantBubbleTransition";
import { ScanAssistantPegtopLoader } from "./ScanAssistantPegtopLoader";
import "./scanAssistantChatCard.css";

const KIND_META: Partial<Record<ScanAssistantMessageKind, string>> = {
  welcome: "欢迎",
  alert: "提醒",
};

export type ScanAssistantChatCardProps = {
  kind: ScanAssistantMessageKind;
  text: string;
  isStreaming: boolean;
  isAwaitingFirstToken: boolean;
  isTyping: boolean;
  placement: BubblePlacement;
  phase: ScanAssistantBubblePhase;
  onDismiss: () => void;
  /** 文案下方的交互区（提问输入框等）；播报气泡不传 */
  footer?: ReactNode;
  /** 右上角浮层里、关闭按钮左侧的额外操作（如「展开为大窗」）；播报气泡不传 */
  actions?: ReactNode;
  /** 本次对话的标题：浮在左上角，与右上角那排按钮同一条线，不占 layout 行 */
  title?: string;
  dismissLabel?: string;
  /** 提问面板：内容底板比边框窄一档，露出旋转的彩虹边框环 */
  askPanel?: boolean;
};

export function ScanAssistantChatCard({
  kind,
  text,
  isStreaming,
  isAwaitingFirstToken,
  isTyping,
  placement,
  phase,
  onDismiss,
  footer,
  actions,
  title,
  dismissLabel = "收起助手播报",
  askPanel = false,
}: ScanAssistantChatCardProps) {
  const metaLabel = KIND_META[kind];
  const showStreamCaret = isStreaming && text.length > 0;
  const showTypingCaret = isTyping && !isStreaming;
  const pegtopAnimated = isAwaitingFirstToken || isStreaming || isTyping;
  const showThinkingLabel = isAwaitingFirstToken && text.trim().length === 0;
  const hasMessageCopy = showThinkingLabel || text.trim().length > 0;

  return (
    <div
      className={[
        "scan-assistant-chat-card",
        `scan-assistant-chat-card--${kind}`,
        `scan-assistant-chat-card--${placement}`,
        phase === "entering" ? "scan-assistant-chat-card--entering" : "",
        phase === "exiting" ? "scan-assistant-chat-card--exiting" : "",
        isAwaitingFirstToken ? "scan-assistant-chat-card--loading" : "",
        askPanel ? "scan-assistant-chat-card--ask" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy={pegtopAnimated || undefined}
    >
      <div className="scan-assistant-chat-card__frame">
        <div className="scan-assistant-chat-card__glow" aria-hidden />
        <div className="scan-assistant-chat-card__particles" aria-hidden>
          <span className="scan-assistant-chat-card__particle" />
          <span className="scan-assistant-chat-card__particle" />
          <span className="scan-assistant-chat-card__particle" />
          <span className="scan-assistant-chat-card__particle" />
          <span className="scan-assistant-chat-card__particle" />
          <span className="scan-assistant-chat-card__particle" />
        </div>
        <div className="scan-assistant-chat-card__panel">
          {metaLabel ? (
            <span className="scan-assistant-chat-card__meta">{metaLabel}</span>
          ) : null}

          <div className="scan-assistant-chat-card__body">
            {/* 陀螺只在有正文时留在正文行首；提问面板的正文是对话历史，行首图标挂在每条回答上 */}
            {hasMessageCopy ? (
              <div className="scan-assistant-chat-card__message-row">
                <ScanAssistantPegtopLoader animated={pegtopAnimated} />
                <div className="scan-assistant-chat-card__message-copy">
                  {showThinkingLabel ? (
                    <p className="scan-assistant-chat-card__loading-label">思考中…</p>
                  ) : null}
                  {text.trim().length > 0 ? (
                    <p className="scan-assistant-chat-card__text">
                      {text}
                      {showStreamCaret ? (
                        <span
                          className="scan-assistant-chat-card__caret scan-assistant-chat-card__caret--stream"
                          aria-hidden
                        />
                      ) : null}
                      {showTypingCaret ? (
                        <span
                          className="scan-assistant-chat-card__caret scan-assistant-chat-card__caret--typing"
                          aria-hidden
                        />
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {footer}
          </div>
        </div>
      </div>

      {/* 挂在外框之外：外框 overflow:clip 会把半悬出圆角的按钮裁掉 */}
      <div className="scan-assistant-chat-card__actions">
        {actions}
        <button
          type="button"
          className="scan-assistant-chat-card__action"
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>

      {/*
        * 本次对话的标题：**浮在左上角**，与右边那排圆按钮同处一条线上，不占任何 layout 行。
        * 面板本来就没有标题栏，加一行会把消息整体下压；浮层则只借用边框外那点空白。
      */}
      {title ? (
        <span className="scan-assistant-chat-card__title" title={title}>
          {title}
        </span>
      ) : null}
    </div>
  );
}
