import { useEffect, useRef, useState } from "react";
import { CarrierVisual } from "./carrier/CarrierVisual";
import type { CarrierId, CarrierState } from "./carrier/carrier";
import { Z_INDEX } from "@/constants/zIndex";
import type { ScanAssistantMessage } from "@/store/useScanAssistantStore";
import type { BubbleSize } from "./computeBubblePlacement";
import { ScanAssistantAskPanel } from "./ScanAssistantAskPanel";
import { ScanAssistantBubble } from "./ScanAssistantBubble";
import { DEFAULT_ORB_BOX } from "./snapGeometry";
import type { ScanAssistantBubblePhase } from "./useScanAssistantBubbleTransition";
import { useScanAssistantDrag } from "./useScanAssistantDrag";
import "./scanAssistantDock.css";

type ScanAssistantDockProps = {
  orbSize: number;
  carrier: CarrierId;
  orbBox?: number;
  isSpeaking: boolean;
  activeMessage: ScanAssistantMessage | null;
  bubbleCollapsed: boolean;
  bubblePhase: ScanAssistantBubblePhase;
  bubbleText: string;
  isStreaming: boolean;
  isAwaitingFirstToken: boolean;
  isTyping: boolean;
  /** 提问面板；与播报气泡共用锚点，播报优先 */
  askOpen: boolean;
  onDismissMessage: () => void;
  onAskDismiss: () => void;
  onOrbClick: () => void;
};

export function ScanAssistantDock({
  orbSize,
  carrier,
  orbBox = DEFAULT_ORB_BOX,
  isSpeaking,
  activeMessage,
  bubbleCollapsed,
  bubblePhase,
  bubbleText,
  isStreaming,
  isAwaitingFirstToken,
  isTyping,
  askOpen,
  onDismissMessage,
  onAskDismiss,
  onOrbClick,
}: ScanAssistantDockProps) {
  const bubbleAnchorRef = useRef<HTMLDivElement>(null);
  const [bubbleSize, setBubbleSize] = useState<BubbleSize | null>(null);

  // 可见性以 store 全文为准；bubbleText 在流式结束切打字机时会短暂为空，勿用它做挂载门控
  const showBubble =
    Boolean(activeMessage) &&
    !bubbleCollapsed &&
    (activeMessage!.text.trim().length > 0 || isStreaming);

  /** 播报到达时让位：两者共用同一个锚点，不能同时挂 */
  const showAsk = askOpen && !showBubble;
  const showAnchor = showBubble || showAsk;

  useEffect(() => {
    if (!showAnchor) {
      setBubbleSize(null);
      return;
    }

    const node = bubbleAnchorRef.current;
    if (!node) return;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setBubbleSize({
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
      });
    };

    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    return () => observer.disconnect();
  }, [showAnchor, activeMessage?.id, bubbleText, isStreaming, isAwaitingFirstToken]);

  const {
    orbBox: resolvedOrbBox,
    isDragging,
    dockStyle,
    bubblePlacement,
    bubblePositionStyle,
    orbDragHandlers,
  } = useScanAssistantDrag({
    orbBox,
    onOrbClick,
    bubbleSize: showAnchor ? bubbleSize : null,
    constrainBubbleViewport: showAnchor,
  });

  const carrierState: CarrierState = {
    isDragging,
    isStreaming,
    hasMessage: Boolean(activeMessage),
    kind: activeMessage?.kind ?? null,
  };

  const orbHint = !activeMessage
    ? askOpen
      ? "点击收起提问，拖动可移动位置"
      : "点击向助手提问，拖动可移动位置"
    : bubbleCollapsed
      ? "点击展开对话，拖动可移动位置"
      : "点击收起对话，拖动可移动位置";

  return (
    <div
      className={[
        "scan-assistant-dock",
        isDragging ? "scan-assistant-dock--dragging" : "",
        showAnchor ? "scan-assistant-dock--has-bubble" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...dockStyle, zIndex: Z_INDEX.scanAssistantDock }}
      aria-live="polite"
      aria-label="智能助手"
    >
      <div className="scan-assistant-dock__stack">
        {showBubble && activeMessage ? (
          <ScanAssistantBubble
            key={activeMessage.id}
            anchorRef={bubbleAnchorRef}
            message={activeMessage}
            text={bubbleText}
            isStreaming={isStreaming}
            isAwaitingFirstToken={isAwaitingFirstToken}
            isTyping={isTyping}
            placement={bubblePlacement}
            positionStyle={bubblePositionStyle}
            phase={bubblePhase}
            onDismiss={onDismissMessage}
          />
        ) : null}

        {showAsk ? (
          <ScanAssistantAskPanel
            anchorRef={bubbleAnchorRef}
            placement={bubblePlacement}
            positionStyle={bubblePositionStyle}
            onDismiss={onAskDismiss}
          />
        ) : null}

        <div
          className={[
            "scan-assistant-dock__orb",
            isSpeaking ? "scan-assistant-dock__orb--speaking" : "",
            isDragging ? "scan-assistant-dock__orb--dragging" : "",
            bubbleCollapsed && activeMessage ? "scan-assistant-dock__orb--has-hidden-bubble" : "",
            activeMessage && !bubbleCollapsed ? "scan-assistant-dock__orb--bubble-open" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ width: resolvedOrbBox, height: resolvedOrbBox }}
          role="button"
          tabIndex={0}
          aria-label={orbHint}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOrbClick();
            }
          }}
          {...orbDragHandlers}
        >
          <CarrierVisual carrier={carrier} size={orbSize} state={carrierState} />
        </div>
      </div>
    </div>
  );
}
