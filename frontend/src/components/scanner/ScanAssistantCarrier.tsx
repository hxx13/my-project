import { useCallback, useEffect, useRef, useState } from "react";
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

  /* 自动播放服务端语音：消息展示完毕后播放；消息消失时停止 */
  const speechMessageId = bubbleMessage?.speechMessageId;
  const speechPlayedRef = useRef<number | null>(null);
  const speechAudioRef = useRef<HTMLAudioElement | null>(null);
  const [scanAutoPlay, setScanAutoPlay] = useState(true);

  // 读取中枢开关
  useEffect(() => {
    fetch("/api/v1/twin/speech/scan-auto-play")
      .then((r) => r.json())
      .then((d) => setScanAutoPlay(d.scanAutoPlay !== false))
      .catch(() => setScanAutoPlay(true));
  }, []);

  // 停止语音
  const stopSpeechAudio = useCallback(() => {
    if (speechAudioRef.current) {
      speechAudioRef.current.pause();
      speechAudioRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!scanAutoPlay) return;
    // 文本加载完毕（流式结束）即开始播放，不等打字机动画
    if (!isStreaming && speechMessageId && speechMessageId !== speechPlayedRef.current && !reducedMotion) {
      speechPlayedRef.current = speechMessageId;
      stopSpeechAudio();
      const audio = new Audio(`/api/v1/twin/speech/file/${speechMessageId}`);
      audio.playbackRate = 1.25;
      speechAudioRef.current = audio;
      audio.play().catch(() => {});
    }
    return () => { stopSpeechAudio(); };
  }, [isStreaming, speechMessageId, reducedMotion, scanAutoPlay, stopSpeechAudio]);

  // 气泡收起/消失时停语音
  useEffect(() => {
    if (bubbleCollapsed || !activeMessage) {
      stopSpeechAudio();
      speechPlayedRef.current = null;
    }
  }, [bubbleCollapsed, activeMessage, stopSpeechAudio]);

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
