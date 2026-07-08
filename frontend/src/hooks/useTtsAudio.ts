/**
 * useTtsAudio — TTS 语音播放 Hook
 *
 * 默认使用浏览器内置 Web Speech API（零延迟、零后端）。
 * 设置 backend: "cosyvoice" 可切换到 CosyVoice 流式合成。
 *
 * 用法：
 *   const { play, stop, isPlaying } = useTtsAudio();
 *   <button onClick={() => play("你好世界")}>🔊</button>
 */

import { useRef, useState, useCallback } from "react";
import { authStorage } from "@/features/auth/authStorage";
import type { SpeechVoiceId } from "@/api/domains/speech.api";

type TtsPlayState = "idle" | "loading" | "playing" | "error";

/* ------------------------------------------------------------------ */
/*  Browser TTS (Web Speech API) — 默认，零延迟                        */
/* ------------------------------------------------------------------ */

function _browserTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function _speakBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!_browserTtsSupported()) { resolve(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 1.1;  // 稍快，适合播报
    u.pitch = 1.0;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

/* ------------------------------------------------------------------ */
/*  CosyVoice PCM 流式（慢，但支持音色克隆）                            */
/* ------------------------------------------------------------------ */

function streamUrl(): string {
  return import.meta.env.VITE_COSYVOICE_STREAM_URL || "/api/v1/twin/speech/tts/stream";
}

function authHeader(): Record<string, string> {
  const token = authStorage.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function _playCosyVoiceStream(
  text: string,
  voiceId: string,
  signal: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (streamUrl().startsWith("/api/")) Object.assign(headers, authHeader());

  const resp = await fetch(streamUrl(), {
    method: "POST", headers,
    body: JSON.stringify({ text, voice_id: voiceId }),
    signal,
  });
  if (!resp.ok || !resp.body) throw new Error("Stream unavailable");

  const sampleRate = parseInt(resp.headers.get("X-Pcm-Sample-Rate") || "24000", 10) || 24000;
  const ctx = new AudioContext({ sampleRate });
  const reader = resp.body.getReader();
  let accumulated = new ArrayBuffer(0);
  let started = false;
  let source: AudioBufferSourceNode | null = null;
  let startTime = 0;
  const PREBUFFER_SEC = 2.0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (signal.aborted) { ctx.close(); return; }
    if (!value || value.byteLength === 0) continue;

    const chunk = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    const merged = new Uint8Array(accumulated.byteLength + chunk.byteLength);
    merged.set(new Uint8Array(accumulated), 0);
    merged.set(chunk, accumulated.byteLength);
    accumulated = merged.buffer;

    if (!started && accumulated.byteLength / 2 / sampleRate < PREBUFFER_SEC) continue;
    if (!started) started = true;

    const now = ctx.currentTime;
    let offsetSamples = 0;
    if (source && startTime > 0) offsetSamples = Math.max(0, Math.floor((now - startTime) * sampleRate));
    if (source) { try { source.stop(); } catch {} }

    const buffer = _pcmToAudioBuffer(ctx, accumulated, sampleRate);
    if (!buffer) continue;
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0, offsetSamples / sampleRate);
    startTime = now;
  }
  ctx.close();
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useTtsAudio() {
  const [state, setState] = useState<TtsPlayState>("idle");
  const audioRef = useRef<SpeechSynthesisUtterance | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    if (_browserTtsSupported()) speechSynthesis.cancel();
    audioRef.current = null;
    setState("idle");
  }, []);

  const play = useCallback(
    async (text: string, voiceId: SpeechVoiceId = "default",
           opts?: { backend?: "browser" | "cosyvoice" }) => {
      stop();
      const trimmed = text.trim();
      if (!trimmed) return;
      const capped = trimmed.length > 300 ? trimmed.slice(0, 300) : trimmed;
      const backend = opts?.backend || "browser";

      setState("loading");
      try {
        if (backend === "cosyvoice") {
          const controller = new AbortController();
          abortRef.current = controller;
          setState("playing");
          await _playCosyVoiceStream(capped, voiceId, controller.signal);
          setState("idle");
        } else {
          setState("playing");
          await _speakBrowser(capped);
          setState("idle");
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.warn("[tts] error:", err);
        setState("error");
      }
    },
    [stop],
  );

  return {
    play, stop, state,
    isPlaying: state === "playing",
    isLoading: state === "loading",
    isError: state === "error",
    browserSupported: _browserTtsSupported(),
  } as const;
}

/* ------------------------------------------------------------------ */
/*  PCM helper                                                         */
/* ------------------------------------------------------------------ */

function _pcmToAudioBuffer(ctx: AudioContext, pcm: ArrayBuffer, rate: number): AudioBuffer | null {
  try {
    const samples = new Int16Array(pcm);
    if (samples.length === 0) return null;
    const buffer = ctx.createBuffer(1, samples.length, rate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    return buffer;
  } catch { return null; }
}
