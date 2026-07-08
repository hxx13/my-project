/**
 * useSpeechPregen — 服务端语音文件管理
 *
 * - 音频由 CosyVoice 生成并存盘到 data/speech/{messageId}.mp3
 * - GET  /api/v1/twin/speech/file/{id}       → 下载音频
 * - POST /api/v1/twin/speech/generate/{id}    → 触发生成（幂等）
 * - GET  /api/v1/twin/speech/file/{id}/status → 检查是否已生成
 *
 * readyIds 通过 sessionStorage 持久化，刷新页面不丢失。
 * 页面加载时自动检查音频状态（单线程顺序检查，避免 ERR_INSUFFICIENT_RESOURCES）。
 */

import { useRef, useCallback, useState } from "react";
import { authStorage } from "@/features/auth/authStorage";

const SESSION_KEY = "speechPregenReadyIds";

function loadReadyIdsFromStorage(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const arr: string[] = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch { /* ignore corrupt data */ }
  return new Set();
}

function saveReadyIdsToStorage(ids: Set<string>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...ids]));
  } catch { /* ignore quota exceeded */ }
}

function authHeaders(): Record<string, string> {
  const token = authStorage.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useSpeechPregen() {
  const [readyIds, setReadyIds] = useState<Set<string>>(loadReadyIdsFromStorage);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobCacheRef = useRef<Map<string, string>>(new Map()); // id → blobUrl

  /** readyIds 变更时同步到 sessionStorage */
  const updateReadyIds = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setReadyIds((prev) => {
      const next = updater(prev);
      saveReadyIdsToStorage(next);
      return next;
    });
  }, []);

  const isReady = useCallback(
    (id: number | string) => readyIds.has(String(id)),
    [readyIds],
  );

  /** 检查单条消息的音频状态 */
  const checkStatus = useCallback(async (messageId: number | string) => {
    const id = String(messageId);
    try {
      const resp = await fetch(`/api/v1/twin/speech/file/${id}/status`, {
        headers: authHeaders(),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.ready) {
        updateReadyIds((prev) => { const n = new Set(prev); n.add(id); return n; });
      }
    } catch { /* ignore */ }
  }, [updateReadyIds]);

  /** 批量检查（页面加载时） */
  const checkAll = useCallback(async (ids: (number | string)[]) => {
    for (const messageId of ids) {
      await checkStatus(messageId);
    }
  }, [checkStatus]);

  /**
   * 从服务端同步已生成列表（GET /ready-ids）。
   * 后端/浏览器重启后，磁盘上的音频文件不会丢失——此方法恢复完整记录。
   * 与 sessionStorage 合并，不重复添加已知 ID。
   */
  const syncFromServer = useCallback(async () => {
    try {
      const resp = await fetch("/api/v1/twin/speech/ready-ids", {
        headers: authHeaders(),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const serverIds: number[] = data.ids ?? [];
      if (!serverIds.length) return;
      updateReadyIds((prev) => {
        const next = new Set(prev);
        let added = 0;
        for (const id of serverIds) {
          const sid = String(id);
          if (!next.has(sid)) { next.add(sid); added++; }
        }
        // 只有实际新增时才写 sessionStorage（避免无变化时覆盖）
        return added > 0 ? next : prev;
      });
    } catch { /* 静默失败，下次加载对话时 checkStatus 兜底 */ }
  }, [updateReadyIds]);

  /** 触发生成 + 预加载到内存 */
  const generate = useCallback(async (messageId: number | string, text: string) => {
    const id = String(messageId);
    try {
      const resp = await fetch(`/api/v1/twin/speech/generate/${id}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 200), voice_id: "default" }),
      });
      if (!resp.ok) throw new Error("generate failed");

      // 预加载音频到内存 blob，播放时零延迟
      try {
        const audioResp = await fetch(`/api/v1/twin/speech/file/${id}`);
        if (audioResp.ok) {
          const blob = await audioResp.blob();
          const blobUrl = URL.createObjectURL(blob);
          blobCacheRef.current.set(id, blobUrl);
        }
      } catch { /* 预加载失败不影响，播放时回退到直接 URL */ }

      updateReadyIds((prev) => { const n = new Set(prev); n.add(id); return n; });
      return true;
    } catch {
      return false;
    }
  }, [updateReadyIds]);

  /** 播放（优先 blob 缓存 → 回退服务端 URL） */
  const play = useCallback((messageId: number | string) => {
    const id = String(messageId);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

    setPlayingId(id);
    const src = blobCacheRef.current.get(id) || `/api/v1/twin/speech/file/${id}`;
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.onended = () => { setPlayingId(null); audioRef.current = null; };
    audio.onerror = () => { setPlayingId(null); audioRef.current = null; };
    audio.play().catch(() => { setPlayingId(null); audioRef.current = null; });
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlayingId(null);
  }, []);

  return {
    generate, checkAll, checkStatus, play, stop, syncFromServer,
    isReady, playingId, readyIds,
    cacheSize: readyIds.size,
  } as const;
}
