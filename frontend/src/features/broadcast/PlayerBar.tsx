import { useEffect, useRef, useState } from "react";
import { Play, Square, Volume2, RefreshCw, LogIn, CalendarClock, History } from "lucide-react";
import { AdminButton } from "@/components/admin/AdminButton";
import type { BroadcastStatus } from "@/api/domains/broadcast.api";
import { dotClass, dotColor } from "./ui";
import { fmtClock } from "./useZoneProgress";

/** 底栏显示的「实际在放什么」。没有分区在播时传 null。 */
export interface NowPlaying {
  song: string;
  position: number;
  duration: number | null;
  ratio: number | null;
}

/**
 * 底部播放条 —— 照现代音乐播放器那样摆：**左传输 / 中当前曲目 / 右其余**。
 * 传输按钮居中是有意的：它是这一页最常用的动作，位置固定才形成肌肉记忆。
 *
 * 中间那条进度是**真实的**：平台不提供播放位置（分区对象里没有任何时间字段，
 * 也没有 seek 命令），所以按「分区当前曲名 + 该曲时长 + 侦测到这一首的时刻」推算，
 * 换曲自动重新起算 —— 跟着实际播放走，不再是原来那条只表示「在放、位置未知」的呼吸条。
 */
export default function PlayerBar({
  status,
  planCount,
  nowPlaying,
  zoneCount,
  volume,
  onVolumeApply,
  canPlay,
  canStop,
  canApplyVolume,
  playing,
  reconnecting,
  relogging,
  onPlay,
  onStop,
  onReconnect,
  onRelogin,
  onOpenPlans,
  onOpenLogs,
}: {
  status?: BroadcastStatus;
  planCount: number;
  nowPlaying: NowPlaying | null;
  zoneCount: number;
  volume: number;
  onVolumeApply: (v: number) => void;
  canPlay: boolean;
  canStop: boolean;
  canApplyVolume: boolean;
  playing: boolean;
  reconnecting: boolean;
  relogging: boolean;
  onPlay: () => void;
  onStop: () => void;
  onReconnect: () => void;
  onRelogin: () => void;
  onOpenPlans: () => void;
  onOpenLogs: () => void;
}) {
  const connected = status?.connected ?? false;
  const loggedIn = status?.loggedIn ?? false;
  const kind: "ok" | "warn" | "bad" = loggedIn ? "ok" : connected ? "warn" : "bad";
  // 短文案：这条是"一行必须装下"的底栏，长文案会把别的挤到第二行
  const stateText = loggedIn ? "已连接" : connected ? "未登录" : "未连接";

  return (
    <div className="flex shrink-0 items-center gap-3 rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 shadow-twin-level-2">
      {/* 传输 + 当前曲目 + 进度条 **合成一行**（底栏就真的一行）。
          进度条**只渲染、不可拖**：平台没有 seek 命令，位置也拿不到，
          所以按「曲名 + 时长 + 侦测到这一首的时刻」推算；拿不到时长就不画。 */}
      <span
        className="flex min-w-0 flex-1 items-center gap-3"
        title={
          (nowPlaying ? `正在播放：${nowPlaying.song}` : "当前没有分区在播放") +
          (zoneCount > 0 ? ` · 已选 ${zoneCount} 区` : "")
        }
      >
        <span className="flex shrink-0 items-center gap-2">
          <AdminButton
            tone="primary"
            className="h-9 px-4"
            loading={playing}
            disabled={!canPlay}
            onClick={onPlay}
          >
            <Play className="mr-1 h-4 w-4" />
            播放{zoneCount > 0 ? `(${zoneCount})` : ""}
          </AdminButton>
          {/* 停止用**实底红**。仓库全局的危险态是「淡红底 + 红字」，这里按用户口径要实底；
              hover 也要一起覆盖，否则会掉回 secondary 的灰底。 */}
          <AdminButton
            tone="secondary"
            className="h-9 px-4 border-[var(--app-color-feedback-danger)] bg-[var(--app-color-feedback-danger)] text-white hover:bg-[var(--app-color-feedback-danger)] hover:brightness-95"
            disabled={!canStop}
            onClick={onStop}
          >
            <Square className="mr-1 h-4 w-4" />
            停止{zoneCount > 0 ? `(${zoneCount})` : ""}
          </AdminButton>
        </span>

        {/* 音量紧挨着传输按钮 —— 这三样是一组操作，摆在一起才好用 */}
        <VolumeControl value={volume} disabled={!canApplyVolume} onCommit={onVolumeApply} />

        <span className="min-w-0 shrink truncate text-sm">
          <span className="text-[var(--app-color-text-tertiary)]">{nowPlaying ? "正在播放 " : ""}</span>
          <b className="text-[var(--app-color-text-primary)]">{nowPlaying?.song || "未在播放"}</b>
        </span>

        <span
          className="relative h-1 min-w-[72px] flex-1 overflow-hidden rounded-full bg-[var(--app-color-surface-hover)]"
          title="按曲目时长推算（平台不提供播放位置，无法跳转）"
        >
          {nowPlaying?.ratio != null ? (
            <span
              className="block h-full rounded-full bg-[var(--app-color-accent)]"
              style={{ width: `${(nowPlaying.ratio * 100).toFixed(1)}%` }}
            />
          ) : null}
        </span>

        <span className="shrink-0 text-[11px] tabular-nums text-[var(--app-color-text-tertiary)]">
          {nowPlaying
            ? `${fmtClock(nowPlaying.position)} / ${nowPlaying.duration ? fmtClock(nowPlaying.duration) : "--:--"}`
            : "--:-- / --:--"}
        </span>
      </span>

      {/* 右：收纳入口 + 连接状态。整条 shrink-0 且**不换行** —— 底栏必须一行装下 */}
      <span className="flex shrink-0 items-center gap-3">
        <AdminButton tone="secondary" className="h-8 px-2" onClick={onOpenPlans}>
          <CalendarClock className="mr-1 h-3.5 w-3.5" />
          定时方案{planCount > 0 ? ` (${planCount})` : ""}
        </AdminButton>
        <AdminButton tone="secondary" className="h-8 px-2" onClick={onOpenLogs}>
          <History className="mr-1 h-3.5 w-3.5" />
          播放记录
        </AdminButton>

        <span className="h-6 w-px shrink-0 bg-[var(--twin-hairline)]" aria-hidden />

        <span
          className="flex items-center gap-1.5 text-xs text-[var(--app-color-text-secondary)]"
          title={status?.lastError ? `最近错误：${status.lastError}` : undefined}
        >
          <span className={dotClass} style={{ background: dotColor(kind) }} />
          {stateText}
        </span>
        <AdminButton tone="secondary" className="h-8 px-2" loading={reconnecting} onClick={onReconnect}>
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="sr-only">重新连接</span>
        </AdminButton>
        <AdminButton tone="secondary" className="h-8 px-2" loading={relogging} onClick={onRelogin}>
          <LogIn className="h-3.5 w-3.5" />
          <span className="sr-only">重新登录</span>
        </AdminButton>
      </span>
    </div>
  );
}

/** 音量滑条：拖动只改本地值，松手才作用到已选分区（对齐分区行滑条的交互）。 */
function VolumeControl({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(value);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setLocal(value);
  }, [value]);

  return (
    <span
      className="flex shrink-0 items-center gap-1.5"
      title={disabled ? "先勾选分区才能调音量" : "对已选分区生效，松手即应用"}
    >
      <Volume2
        className="h-4 w-4 shrink-0"
        style={{ color: disabled ? "var(--app-color-text-tertiary)" : "var(--app-color-text-secondary)" }}
      />
      <input
        type="range"
        min={0}
        max={100}
        value={local}
        disabled={disabled}
        className="h-4 w-24 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        style={{ accentColor: "var(--app-color-accent)" }}
        onChange={(e) => {
          dirty.current = true;
          setLocal(Number(e.target.value));
        }}
        onPointerUp={() => {
          dirty.current = false;
          onCommit(local);
        }}
        onKeyUp={() => {
          dirty.current = false;
          onCommit(local);
        }}
      />
      <span className="w-7 shrink-0 text-right text-xs tabular-nums text-[var(--app-color-text-secondary)]">
        {local}
      </span>
    </span>
  );
}
