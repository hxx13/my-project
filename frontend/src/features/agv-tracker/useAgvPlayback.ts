import { useState, useEffect, useRef } from "react";
import {
  fetchHistoryPlayback,
  type HistoryPlaybackResponse,
} from "@/api/domains/agv.api";

export function useAgvPlayback() {
  const [playback, setPlayback] = useState<{
    ip: string;
    from: string;
    to: string;
    data: HistoryPlaybackResponse | null;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);

  // Ref for canvas to read every frame without triggering React re-renders
  const progressRef = useRef(0);

  // 回放动画循环：ref 驱动 Canvas（零重渲染），state 每 250ms 同步进度条
  useEffect(() => {
    if (!playbackPlaying || !playback || !playback.data) return;
    let raf: number;
    let lastTs: number | null = null;
    let lastUiSync = 0;
    const totalMs = new Date(playback.to).getTime() - new Date(playback.from).getTime();
    if (totalMs <= 0) return;

    const loop = (ts: number) => {
      if (lastTs == null) lastTs = ts;
      const elapsed = (ts - lastTs) * playbackSpeed;
      lastTs = ts;
      const next = progressRef.current + elapsed / totalMs;
      if (next >= 1) {
        progressRef.current = 1;
        setPlaybackPlaying(false);
        setPlaybackProgress(1);
        return;
      }
      progressRef.current = next;
      // 进度条每 250ms 同步（4fps UI，Canvas 仍是 60fps）
      if (ts - lastUiSync > 250) {
        lastUiSync = ts;
        setPlaybackProgress(next);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playbackPlaying, playback?.from, playback?.to, playbackSpeed]);

  const startHistoryPlayback = async (ip: string, from: string, to: string, autoPlay = false) => {
    setPlayback({ ip, from, to, data: null, loading: true, error: null });
    progressRef.current = 1;
    setPlaybackProgress(1);
    setPlaybackPlaying(false);
    try {
      const data = await fetchHistoryPlayback(ip, from, to);
      setPlayback({ ip, from, to, data, loading: false, error: null });
      if (autoPlay) {
        progressRef.current = 0;
        setPlaybackProgress(0);
        setPlaybackPlaying(true);
      }
    } catch (e: any) {
      setPlayback({ ip, from, to, data: null, loading: false, error: e?.message || "加载失败" });
    }
  };

  const clearPlayback = () => {
    setPlayback(null);
    progressRef.current = 1;
    setPlaybackProgress(1);
    setPlaybackPlaying(false);
  };

  const stopPlaybackKeepTimeline = () => {
    setPlayback(null);
    progressRef.current = 1;
    setPlaybackProgress(1);
    setPlaybackPlaying(false);
  };

  const handlePlaybackPlay = () => {
    progressRef.current = 0;
    setPlaybackProgress(0);
    setPlaybackPlaying(true);
  };

  return {
    playback,
    setPlayback,
    playbackSpeed,
    setPlaybackSpeed,
    playbackPlaying,
    setPlaybackPlaying,
    playbackProgress,
    setPlaybackProgress,
    progressRef,   // ← canvas 直接读此 ref，不走 React re-render
    startHistoryPlayback,
    clearPlayback,
    stopPlaybackKeepTimeline,
    handlePlaybackPlay,
  };
}
