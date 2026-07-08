/**
 * 语音合成 API — 调用 CosyVoice 3 微服务
 *
 * 前端 → Java Proxy (/api/v1/twin/speech/tts) → CosyVoice (127.0.0.1:50000)
 *
 * TTS 服务地址可通过 VITE_COSYVOICE_URL 环境变量覆盖（用于本地调试直连）
 */
import { authStorage } from "@/features/auth/authStorage";

function authHeaders(): Record<string, string> {
  const token = authStorage.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const TTS_URL =
  import.meta.env.VITE_COSYVOICE_URL || "/api/v1/twin/speech/tts";

export type SpeechVoiceId = "default" | "warm" | "alert" | string;

export type SpeechRequest = {
  text: string;
  voice_id?: SpeechVoiceId;
};

/**
 * 调用 TTS 合成语音，返回 WAV 音频 Blob。
 * 失败时返回 null（静默失败，不阻断主流程）。
 */
export async function synthesizeSpeech(
  text: string,
  voiceId: SpeechVoiceId = "default",
  signal?: AbortSignal,
): Promise<Blob | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // 如果是走 Java 代理路径，携带认证头
    if (TTS_URL.startsWith("/api/")) {
      Object.assign(headers, authHeaders());
    }

    const resp = await fetch(TTS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: trimmed, voice_id: voiceId }),
      signal,
    });

    if (!resp.ok) {
      console.warn("[speech] TTS request failed:", resp.status, resp.statusText);
      return null;
    }

    return await resp.blob();
  } catch (err: any) {
    if (err?.name === "AbortError") return null;
    console.warn("[speech] TTS synthesis error:", err);
    return null;
  }
}
