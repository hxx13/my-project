import { useEffect, useRef, useState } from "react";
import { CarrierVisual } from "./carrier/CarrierVisual";
import type { CarrierId, CarrierState } from "./carrier/carrier";
import { Z_INDEX } from "@/constants/zIndex";
import type { ScanAssistantMessage } from "@/store/useScanAssistantStore";
import type { BubbleSize } from "./computeBubblePlacement";
import { ScanAssistantAskPanel } from "./ScanAssistantAskPanel";
import { DEFAULT_ORB_BOX } from "./snapGeometry";
import { useScanAssistantDrag } from "./useScanAssistantDrag";
import "./scanAssistantDock.css";

type ScanAssistantDockProps = {
  orbSize: number;
  carrier: CarrierId;
  orbBox?: number;
  isSpeaking: boolean;
  activeMessage: ScanAssistantMessage | null;
  bubbleCollapsed: boolean;
  bubbleText: string;
  isStreaming: boolean;
  isAwaitingFirstToken: boolean;
  isTyping: boolean;
  /** 提问面板的开关；播报在时也照开（两者同一张卡） */
  askOpen: boolean;
  onAskDismiss: () => void;
  onOrbClick: () => void;
  /** 透传给提问面板的两个入口（新建会话 / 历史会话侧栏），行为由载体接入 */
  onNewChat?: () => void;
  onOpenHistory?: () => void;
  /** 播报里「绑定校园卡」入口的落点（载体接注册表，见 scanAssistantSpeak） */
  onUnboundBind?: (userId: string) => void;
};

export function ScanAssistantDock({
  orbSize,
  carrier,
  orbBox = DEFAULT_ORB_BOX,
  isSpeaking,
  activeMessage,
  bubbleCollapsed,
  bubbleText,
  isStreaming,
  isAwaitingFirstToken,
  isTyping,
  askOpen,
  onAskDismiss,
  onOrbClick,
  onNewChat,
  onOpenHistory,
  onUnboundBind,
}: ScanAssistantDockProps) {
  const bubbleAnchorRef = useRef<HTMLDivElement>(null);
  const [bubbleSize, setBubbleSize] = useState<BubbleSize | null>(null);

  // 可见性以 store 全文为准；bubbleText 在流式结束切打字机时会短暂为空，勿用它做挂载门控
  const hasBroadcast =
    Boolean(activeMessage) &&
    !bubbleCollapsed &&
    (activeMessage!.text.trim().length > 0 || isStreaming || isAwaitingFirstToken);

  /**
   * 播报与提问**共用一张卡**（带输入框的那张）。
   *
   * 原来播报走的是另一套「没有输入框」的小卡，与提问面板争同一个锚点（谁在就挂谁，播报优先）——
   * 于是刷卡后的欢迎语弹出来时，用户看到的是不能接着说话的那一张，想追问还得先点收起再点开。
   * 现在统一：有播报就开这张卡，播报作为最新一条消息铺在对话里，输入框就在下面。
   */
  const showAsk = askOpen || hasBroadcast;
  const showAnchor = showAsk;

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
        {showAsk ? (
          <ScanAssistantAskPanel
            anchorRef={bubbleAnchorRef}
            placement={bubblePlacement}
            positionStyle={bubblePositionStyle}
            onDismiss={onAskDismiss}
            onNewChat={onNewChat}
            onOpenHistory={onOpenHistory}
            /* 播报（刷卡欢迎语等）也铺进这张卡，不再单独弹没有输入框的那种卡 */
            incoming={
              activeMessage
                ? {
                    key: activeMessage.id,
                    text: bubbleText || activeMessage.text,
                    isStreaming,
                    isAwaitingFirstToken,
                    isTyping,
                    unboundCard: activeMessage.unboundCard,
                    personKey: activeMessage.personKey,
                  }
                : null
            }
            onUnboundBind={onUnboundBind}
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
