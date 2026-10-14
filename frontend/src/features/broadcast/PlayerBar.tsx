import { useEffect, useRef, useState } from "react";
import { Play, Square, Volume2, RefreshCw, LogIn, CalendarClock, History } from "lucide-react";
import { AdminButton } from "@/components/admin/AdminButton";
import type { BroadcastStatus } from "@/api/domains/broadcast.api";
import { dotClass, dotColor } from "./ui";

/**
 * 底部播放条 —— 照现代音乐播放器那样摆：**左曲目 / 中传输 / 右其余**。
 * 传输按钮居中是有意的：它是这一页最常用的动作，位置固定才形成肌肉记忆。
 *
 * 原来这几样分在「顶栏」和「中间一列」两处，中间那列很窄、又白占一栏宽度，
 * 合成一条底栏后主区就是干净的两栏（选曲 | 选分区）。
 */
export default function PlayerBar({
  status,
  planCount,
  songName,
  songDuration,
  zoneCount,
  playingCount,
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
  songName: string;
  /** 当前曲目总时长（秒）；取不到传 null */
  songDuration: number | null;
  zoneCount: number;
  playingCount: number;
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
          进度条**只渲染、不可拖**：实测平台的分区对象里没有任何时间/进度字段，
          也没有 seek 命令 —— 位置取不到、跳转做不到。播放中画一条呼吸的实心条，
          表示「在放、位置未知」，比一条永远空着的死条诚实。 */}
      <span
        className="flex min-w-0 flex-1 items-center gap-3"
        title={
          `曲目：${songName || "未选"}` +
          (zoneCount > 0 ? ` · 已选 ${zoneCount} 区` : "") +
          (playingCount > 0 ? ` · ${playingCount} 区在播` : "")
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
          <span className="text-[var(--app-color-text-tertiary)]">{songName ? "正在播放 " : ""}</span>
          <b className="text-[var(--app-color-text-primary)]">{songName || "未选曲目"}</b>
        </span>

        <span
          className="h-1 min-w-[72px] flex-1 overflow-hidden rounded-full bg-[var(--app-color-surface-hover)]"
          title="平台不提供播放进度，也无法跳转，所以这里只显示状态"
        >
          {playingCount > 0 ? (
            <span className="block h-full w-full animate-pulse rounded-full bg-[var(--app-color-accent)]" />
          ) : null}
        </span>

        <span className="shrink-0 text-[11px] tabular-nums text-[var(--app-color-text-tertiary)]">
          {formatDuration(songDuration)}
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

/** 秒 → m:ss；取不到就显示占位 */
function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) {
    return "--:--";
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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
