import type { CSSProperties, Ref } from "react";
import type { ScanAssistantMessage } from "@/store/useScanAssistantStore";
import type { BubblePlacement } from "./computeBubblePlacement";
import { ScanAssistantChatCard } from "./ScanAssistantChatCard";
import type { ScanAssistantBubblePhase } from "./useScanAssistantBubbleTransition";

type ScanAssistantBubbleProps = {
  anchorRef?: Ref<HTMLDivElement>;
  message: ScanAssistantMessage;
  text: string;
  isStreaming: boolean;
  isAwaitingFirstToken: boolean;
  isTyping: boolean;
  placement: BubblePlacement;
  positionStyle: CSSProperties;
  phase: ScanAssistantBubblePhase;
  onDismiss: () => void;
};

export function ScanAssistantBubble({
  anchorRef,
  message,
  text,
  isStreaming,
  isAwaitingFirstToken,
  isTyping,
  placement,
  positionStyle,
  phase,
  onDismiss,
}: ScanAssistantBubbleProps) {
  return (
    <div
      ref={anchorRef}
      className={[
        "scan-assistant-bubble-anchor",
        `scan-assistant-bubble-anchor--${placement}`,
      ].join(" ")}
      style={positionStyle}
    >
      <ScanAssistantChatCard
        kind={message.kind}
        text={text}
        isStreaming={isStreaming}
        isAwaitingFirstToken={isAwaitingFirstToken}
        isTyping={isTyping}
        placement={placement}
        phase={phase}
        onDismiss={onDismiss}
      />
    </div>
  );
}
