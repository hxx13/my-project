import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { ScanAssistantDock } from "@/components/scanner/scan-assistant/ScanAssistantDock";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicRuntimeConfig } from "@/api/domains/notification.api";
import { CARRIER_IDS, type CarrierId } from "@/components/scanner/scan-assistant/carrier/carrier";
import { isAdminAreaPath, isTwinDashboardHomePath } from "@/features/admin/buildAdminNavModel";
import { usePrefersReducedMotion, useTypewriterText } from "@/hooks/useTypewriterText";
import { useScanAssistantStore } from "@/store/useScanAssistantStore";
import { useScanAssistantBubbleTransition } from "@/components/scanner/scan-assistant/useScanAssistantBubbleTransition";
import { registerScanAssistantAskClose } from "@/components/scanner/scan-assistant/scanAssistantSpeak";

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

  const { data: runtimeConfig } = useQuery({
    queryKey: ["scan-assistant-carrier"],
    queryFn: fetchPublicRuntimeConfig,
    staleTime: 60_000,
  });
  const carrier: CarrierId = (() => {
    const v = runtimeConfig?.["scan.assistant.carrier"];
    return CARRIER_IDS.includes(v as CarrierId) ? (v as CarrierId) : "morph";
  })();

  useEffect(() => {
    if (isTwinDashboardHomePath(pathname) || isAdminAreaPath(pathname)) {
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

  // 气泡消失时停语音
  useEffect(() => {
    if (!activeMessage) {
      stopSpeechAudio();
      speechPlayedRef.current = null;
    }
  }, [activeMessage, stopSpeechAudio]);

  /** 无播报时点击载体 = 开合提问面板 */
  const [askOpen, setAskOpen] = useState(false);
  const dismissMessage = useScanAssistantStore((s) => s.dismissMessage);

  // 注册提问面板关闭通道：DebugNav 识别刷卡时通过 closeScanAssistantAsk() 关闭面板
  useEffect(() => {
    registerScanAssistantAskClose(() => setAskOpen(false));
    return () => registerScanAssistantAskClose(null);
  }, []);

  const handleOrbClick = useCallback(() => {
    setAskOpen((open) => !open);
    if (activeMessage) dismissMessage();
  }, [activeMessage, dismissMessage]);

  const shouldRender = dockVisible || Boolean(activeMessage) || askOpen;

  if (!shouldRender) return null;

  return createPortal(
    <ScanAssistantDock
      orbSize={orbSize}
      carrier={carrier}
      isSpeaking={speaking}
      activeMessage={bubbleMessage}
      bubblePhase={phase}
      bubbleText={bubbleText}
      isStreaming={isStreaming}
      isAwaitingFirstToken={isAwaitingFirstToken}
      isTyping={isTyping}
      bubbleCollapsed={false}
      askOpen={askOpen}
      onDismissMessage={dismissMessage}
      onAskDismiss={() => setAskOpen(false)}
      onOrbClick={handleOrbClick}
    />,
    document.body,
  );
}
