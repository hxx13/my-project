import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { ScanAssistantDock } from "@/components/scanner/scan-assistant/ScanAssistantDock";
import {
  collapseScanAssistantBubble,
  expandScanAssistantFromCarrierClick,
  getTrackedScanPopupPersonKey,
} from "@/components/scanner/scan-assistant/scanAssistantSpeak";
import { isTwinDashboardHomePath } from "@/features/admin/buildAdminNavModel";
import { usePrefersReducedMotion, useTypewriterText } from "@/hooks/useTypewriterText";
import { useScanAssistantStore } from "@/store/useScanAssistantStore";
import { useScanAssistantBubbleTransition } from "@/components/scanner/scan-assistant/useScanAssistantBubbleTransition";

type ScanAssistantCarrierProps = {
  /** orb 缩放（相对 100px 基准），默认 0.76（2× 原 0.38） */
  orbSize?: number;
};

/**
 * 首页智能助手 — MorphOrb 可拖拽载体 + 锚定对话框逐字播报。
 * 接收刷卡/扫码欢迎语与扫码弹窗红色 toast 文案。
 */
export function ScanAssistantCarrier({ orbSize = 0.76 }: ScanAssistantCarrierProps) {
  const { pathname } = useLocation();
  const setDockVisible = useScanAssistantStore((s) => s.setDockVisible);
  const dockVisible = useScanAssistantStore((s) => s.dockVisible);
  const activeMessage = useScanAssistantStore((s) => s.activeMessage);
  const bubbleCollapsed = useScanAssistantStore((s) => s.bubbleCollapsed);

  useEffect(() => {
    if (isTwinDashboardHomePath(pathname)) {
      setDockVisible(true);
    } else if (!activeMessage) {
      setDockVisible(false);
    }
  }, [pathname, activeMessage, setDockVisible]);

  const reducedMotion = usePrefersReducedMotion();
  const { renderedMessage, phase } = useScanAssistantBubbleTransition(activeMessage, {
    reducedMotion,
  });
  // 有 activeMessage 时始终以 store 为准；renderedMessage 仅用于退出动画期间
  const bubbleMessage = activeMessage ?? renderedMessage;
  const fullText = bubbleMessage?.text ?? "";
  const isStreaming = Boolean(bubbleMessage?.isStreaming);
  const isAwaitingFirstToken = isStreaming && fullText.trim().length === 0;
  const { displayed, isTyping } = useTypewriterText(fullText, {
    enabled: Boolean(bubbleMessage) && !reducedMotion && !isStreaming,
    cps: bubbleMessage?.kind === "welcome" ? 42 : 56,
  });
  const bubbleText = reducedMotion || isStreaming ? fullText : displayed;
  const speaking = isStreaming || isTyping;

  const handleOrbClick = useCallback(() => {
    const personKey =
      activeMessage?.personKey?.trim() || getTrackedScanPopupPersonKey()?.trim();
    if (!personKey || !activeMessage) return;

    if (bubbleCollapsed) {
      void expandScanAssistantFromCarrierClick(personKey);
      return;
    }

    collapseScanAssistantBubble();
  }, [activeMessage, bubbleCollapsed]);

  const shouldRender = dockVisible || Boolean(activeMessage);

  if (!shouldRender) return null;

  return createPortal(
    <ScanAssistantDock
      orbSize={orbSize}
      isSpeaking={speaking}
      activeMessage={bubbleMessage}
      bubblePhase={phase}
      bubbleText={bubbleText}
      isStreaming={isStreaming}
      isAwaitingFirstToken={isAwaitingFirstToken}
      isTyping={isTyping}
      bubbleCollapsed={bubbleCollapsed}
      onCollapseBubble={collapseScanAssistantBubble}
      onOrbClick={handleOrbClick}
    />,
    document.body,
  );
}
