import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Pause, Play } from "lucide-react";
import type { ZoneView } from "@/api/domains/broadcast.api";
import { blockBodyClass, blockHeadClass, blockTitleClass, panelClass } from "./ui";
import { fmtClock, type ZoneProgress } from "./useZoneProgress";

/**
 * 分区列表（页面左栏）。勾选 = 这一路参与底栏那组批量操作。
 *
 * **每一路是独立的播放单元**：行内那个 ▶/⏸ 只作用于这一路，暂停它不会动别的分区；
 * 被人工停过的分区，方案的循环/兜底也不会再把它带起来（后端记了覆盖）。
 *
 * 视觉与小程序端保持一致：
 * - 每行是一个**圆角矩形选项**（未选中浅底、选中实心主色 + 同色投影 + 文字反白）。
 * - 状态用**圆点 + 同色文字**：播放中绿、已暂停琥珀、空闲空心灰。
 * - 行底部一条 2px 细线是**真实播放进度**（按曲名 + 时长推算，见 useZoneProgress）。
 */
export default function ZonePanel({
  zones,
  loading,
  hint,
  selected,
  pausedMacs,
  progress,
  onToggle,
  onSelectAll,
  onVolumeCommit,
  onZonePlay,
  onZonePause,
}: {
  zones: ZoneView[];
  loading: boolean;
  hint: string;
  selected: Set<string>;
  /** 被人工停过的分区（方案不会自动恢复它们） */
  pausedMacs: Set<string>;
  progress: Map<string, ZoneProgress>;
  onToggle: (mac: string) => void;
  onSelectAll: (all: boolean) => void;
  onVolumeCommit: (mac: string, volume: number) => void;
  onZonePlay: (mac: string) => void;
  onZonePause: (mac: string) => void;
}) {
  const allSelected = zones.length > 0 && selected.size === zones.length;
  /** 拖动中的音量预览值（按 MAC）。拖动时数字要实时跟手，松手才真正下发。 */
  const [draftVol, setDraftVol] = useState<Record<string, number>>({});

  const setDraft = (mac: string, v: number | null) => {
    setDraftVol((prev) => {
      const next = { ...prev };
      if (v == null) delete next[mac];
      else next[mac] = v;
      return next;
    });
  };

  return (
    <div className={panelClass}>
      <div className={blockHeadClass}>
        <span className={blockTitleClass}>分区（已选 {selected.size}）</span>
        <button
          type="button"
          className="text-xs text-[var(--twin-link)]"
          onClick={() => onSelectAll(!allSelected)}
        >
          {allSelected ? "全不选" : "全选"}
        </button>
      </div>

      <div className={`${blockBodyClass} space-y-1.5 p-2`}>
        {loading ? (
          <div className="px-1 py-4 text-sm text-[var(--app-color-text-tertiary)]">加载中…</div>
        ) : zones.length === 0 ? (
          <div className="px-1 py-4 text-sm text-[var(--app-color-text-tertiary)]">{hint}</div>
        ) : (
          zones.map((z) => {
            const sel = selected.has(z.mac);
            const kind = stateKind(z.playStatus);
            const p = progress.get(z.mac);
            const manualPaused = pausedMacs.has(z.mac);
            return (
              <div
                key={z.mac}
                className={
                  "relative flex items-center gap-2 overflow-hidden rounded-[14px] px-2 py-1.5 text-sm transition-colors " +
                  (sel
                    ? "bg-[var(--app-color-accent)] text-white shadow-[0_2px_10px_rgba(37,99,235,0.28)]"
                    : "bg-[var(--app-color-surface-container)] hover:bg-[var(--app-color-surface-hover)]")
                }
              >
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => onToggle(z.mac)}
                  aria-label={`选择 ${z.name}`}
                />
                {/* 只动这一路：播放中显示暂停，其余显示播放 */}
                <button
                  type="button"
                  className={
                    "grid h-6 w-6 shrink-0 place-items-center rounded-md " +
                    (sel ? "hover:bg-white/20" : "hover:bg-[var(--app-color-surface-hover)]")
                  }
                  title={z.playing ? `暂停 ${z.name}` : `播放 ${z.name}`}
                  aria-label={z.playing ? `暂停 ${z.name}` : `播放 ${z.name}`}
                  onClick={() => (z.playing ? onZonePause(z.mac) : onZonePlay(z.mac))}
                >
                  {z.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                <span className="w-20 shrink-0 truncate font-medium" title={z.name}>
                  {z.name}
                </span>
                {/* 音量条 + 数值 + 状态收成一组（组内 gap 收紧），与名称、曲目之间保持原有间距 */}
                <span className="flex shrink-0 items-center gap-1.5">
                  <VolumeSlider
                    value={z.volume ?? 0}
                    onAccent={sel}
                    onPreview={(v) => setDraft(z.mac, v)}
                    onCommit={(v) => {
                      setDraft(z.mac, null);
                      onVolumeCommit(z.mac, v);
                    }}
                  />
                  <span
                    className="w-9 shrink-0 text-right text-xs tabular-nums"
                    style={{ color: sel ? "#ffffff" : "var(--app-color-text-secondary)" }}
                  >
                    {draftVol[z.mac] ?? z.volume ?? "-"}
                  </span>
                  <span className="flex w-16 shrink-0 items-center gap-1 text-xs">
                    <span
                      className={"inline-block h-2 w-2 shrink-0 rounded-full" + (kind === "playing" ? " animate-pulse" : "")}
                      style={dotStyle(kind, sel)}
                    />
                    <span style={{ color: stateTextColor(kind, sel) }}>{manualPaused ? "已停" : z.playStatusText}</span>
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={{ color: sel ? "#dbeafe" : "var(--app-color-text-secondary)" }}
                    title={p?.song || z.currentSong}
                  >
                    {p?.song || z.currentSong || ""}
                  </span>
                  {p ? (
                    <span
                      className="shrink-0 tabular-nums"
                      style={{ color: sel ? "#dbeafe" : "var(--app-color-text-tertiary)" }}
                      title={p.duration ? "按曲目时长推算（平台不提供播放位置）" : "未知时长"}
                    >
                      {fmtClock(p.position)}
                      {p.duration ? ` / ${fmtClock(p.duration)}` : ""}
                    </span>
                  ) : null}
                </span>

                {/* 真实进度：贴行底的一条细线。拿不到时长就不画（不假装） */}
                {p?.ratio != null ? (
                  <span
                    className="absolute inset-x-0 bottom-0 h-[2px]"
                    style={{ background: sel ? "rgba(255,255,255,0.25)" : "var(--app-color-surface-hover)" }}
                    aria-hidden
                  >
                    <span
                      className="block h-full"
                      style={{ width: `${(p.ratio * 100).toFixed(1)}%`, background: sel ? "#ffffff" : "var(--app-color-accent)" }}
                    />
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** 平台状态码 → 三档：1 播放中 / 2 已暂停 / 其余空闲 */
function stateKind(status: number | null): "playing" | "paused" | "idle" {
  if (status === 1) return "playing";
  if (status === 2) return "paused";
  return "idle";
}

/** 圆点的样式：实心点用背景，空闲态是**空心**（用描边画，否则透明背景等于看不见） */
function dotStyle(kind: "playing" | "paused" | "idle", onAccent: boolean): CSSProperties {
  if (kind === "idle") {
    return {
      background: "transparent",
      border: `2px solid ${onAccent ? "#93c5fd" : "var(--app-color-border-strong)"}`,
      boxSizing: "border-box",
    };
  }
  if (kind === "playing") {
    // 主色底上原绿发脏，换亮一档
    return { background: onAccent ? "#86efac" : "var(--app-color-feedback-success)" };
  }
  return { background: onAccent ? "#fcd34d" : "var(--app-color-feedback-warning)" };
}

function stateTextColor(kind: "playing" | "paused" | "idle", onAccent: boolean): string {
  if (onAccent) {
    return "#dbeafe";
  }
  if (kind === "playing") return "var(--app-color-feedback-success)";
  if (kind === "paused") return "var(--app-color-feedback-warning)";
  return "var(--app-color-text-tertiary)";
}

/** 单行音量滑杆：拖动时只更新本地显示（数值实时跟手），**松手才提交**。
 *  数值由外层用 draft 渲染 —— 外层那个数字原来读服务端值，拖动时不跟手。 */
function VolumeSlider({
  value,
  onAccent,
  onPreview,
  onCommit,
}: {
  value: number;
  onAccent: boolean;
  onPreview: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(value);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setLocal(value);
  }, [value]);

  return (
    <input
      type="range"
      min={0}
      max={100}
      value={local}
      className="h-4 w-20 shrink-0 cursor-pointer"
      style={{ accentColor: onAccent ? "#ffffff" : "var(--app-color-accent)" }}
      onChange={(e) => {
        const v = Number(e.target.value);
        dirty.current = true;
        setLocal(v);
        onPreview(v);
      }}
      onPointerUp={(e) => {
        dirty.current = false;
        onCommit(Number((e.currentTarget as HTMLInputElement).value));
      }}
      onKeyUp={(e) => {
        dirty.current = false;
        onCommit(Number((e.currentTarget as HTMLInputElement).value));
      }}
    />
  );
}
