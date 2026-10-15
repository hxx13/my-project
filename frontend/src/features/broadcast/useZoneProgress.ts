import { useEffect, useMemo, useRef, useState } from "react";
import type { SongListView, ZoneView } from "@/api/domains/broadcast.api";

/**
 * 逐分区的**真实播放进度**。
 *
 * 平台不提供任何播放位置字段（厂家前端里那个 progress 只用于文件上传），所以进度只能推算：
 * 分区对象里带当前曲名 `source_name`，配上曲库里这首歌的时长，从「这一首被侦测到开始」计时。
 * 曲名变了（平台自动续播下一首）就重新起算 —— 所以它跟着实际播放走，不是一条自己走的假条。
 *
 * 精度上限就是轮询间隔（分区列表约 10 秒一刷），换曲后的头几秒可能有偏差，这是平台侧信息缺失
 * 决定的，不是实现偷懒。拿不到时长的曲目只给「已播时长」，不给比例。
 */
export interface ZoneProgress {
  song: string;
  /** 已播秒数 */
  position: number;
  /** 总时长；曲库查不到时为 null */
  duration: number | null;
  /** 0-1；拿不到时长时为 null */
  ratio: number | null;
}

export function useZoneProgress(zones: ZoneView[], lists: SongListView[]): Map<string, ZoneProgress> {
  const durationByFile = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lists) {
      for (const s of l.songs) {
        if (s.durationSeconds && s.fileName) m.set(s.fileName, s.durationSeconds);
      }
    }
    return m;
  }, [lists]);

  /** mac → 当前这一首是什么、什么时候开始算的 */
  const track = useRef(new Map<string, { song: string; startedAt: number }>());
  const [, tick] = useState(0);

  useEffect(() => {
    const next = new Map<string, { song: string; startedAt: number }>();
    for (const z of zones) {
      if (!z.playing || !z.currentSong) continue;
      const prev = track.current.get(z.mac);
      next.set(
        z.mac,
        prev && prev.song === z.currentSong ? prev : { song: z.currentSong, startedAt: Date.now() },
      );
    }
    track.current = next;
    tick((n) => n + 1);
  }, [zones]);

  const anyPlaying = zones.some((z) => z.playing && z.currentSong);
  useEffect(() => {
    if (!anyPlaying) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [anyPlaying]);

  const out = new Map<string, ZoneProgress>();
  const now = Date.now();
  track.current.forEach((v, mac) => {
    const duration = durationByFile.get(v.song) ?? null;
    const elapsed = Math.max(0, (now - v.startedAt) / 1000);
    out.set(mac, {
      song: v.song,
      position: duration ? Math.min(elapsed, duration) : elapsed,
      duration,
      ratio: duration ? Math.min(1, elapsed / duration) : null,
    });
  });
  return out;
}

/** 秒 → m:ss */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
