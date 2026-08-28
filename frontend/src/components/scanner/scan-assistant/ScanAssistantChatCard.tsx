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

          <button
            type="button"
            className="scan-assistant-chat-card__dismiss"
            onClick={onDismiss}
            aria-label={dismissLabel}
          >
            <X className="size-4" strokeWidth={2} />
          </button>

          <div className="scan-assistant-chat-card__body">
            <div className="scan-assistant-chat-card__message-row">
              <ScanAssistantPegtopLoader animated={pegtopAnimated} idle={askPanel && !pegtopAnimated} />
              {hasMessageCopy ? (
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
              ) : null}
            </div>
            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}
