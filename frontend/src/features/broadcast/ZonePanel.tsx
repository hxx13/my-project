import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ZoneView } from "@/api/domains/broadcast.api";
import { blockBodyClass, blockHeadClass, blockTitleClass, panelClass } from "./ui";

/**
 * 分区列表（页面右栏）。勾选 = 这一路参与中间那组操作。
 *
 * 视觉与小程序端保持一致：
 * - 每行是一个**圆角矩形选项**（未选中浅底、选中实心主色 + 同色投影 + 文字反白），
 *   对齐仓库既有选项样式（.spec-opt--on / .station-item--on）。
 * - 状态用**圆点 + 同色文字**：播放中绿、已暂停琥珀、空闲空心灰。
 * - 每行的滑条松手才提交，拖动途中只改本地值，免得一路狂发请求。
 */
export default function ZonePanel({
  zones,
  loading,
  hint,
  selected,
  onToggle,
  onSelectAll,
  onVolumeCommit,
}: {
  zones: ZoneView[];
  loading: boolean;
  hint: string;
  selected: Set<string>;
  onToggle: (mac: string) => void;
  onSelectAll: (all: boolean) => void;
  onVolumeCommit: (mac: string, volume: number) => void;
}) {
  const allSelected = zones.length > 0 && selected.size === zones.length;

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
            return (
              <div
                key={z.mac}
                className={
                  "flex items-center gap-3 rounded-[14px] px-3 py-1.5 text-sm transition-colors " +
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
                <span className="w-24 shrink-0 truncate font-medium" title={z.name}>
                  {z.name}
                </span>
                {/* 音量条 + 数值 + 状态收成一组（组内 gap 收紧），与名称、曲目之间保持原有间距 */}
                <span className="flex shrink-0 items-center gap-1.5">
                  <VolumeSlider
                    value={z.volume ?? 0}
                    onAccent={sel}
                    onCommit={(v) => onVolumeCommit(z.mac, v)}
                  />
                  <span
                    className="w-9 shrink-0 text-right text-xs tabular-nums"
                    style={{ color: sel ? "#ffffff" : "var(--app-color-text-secondary)" }}
                  >
                    {z.volume ?? "-"}
                  </span>
                  <span className="flex w-16 shrink-0 items-center gap-1 text-xs">
                    <span
                      className={"inline-block h-2 w-2 shrink-0 rounded-full" + (kind === "playing" ? " animate-pulse" : "")}
                      style={dotStyle(kind, sel)}
                    />
                    <span style={{ color: stateTextColor(kind, sel) }}>{z.playStatusText}</span>
                  </span>
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-xs"
                  style={{ color: sel ? "#dbeafe" : "var(--app-color-text-secondary)" }}
                  title={z.currentSong}
                >
                  {z.playing ? z.currentSong : ""}
                </span>
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

/** 单行音量滑杆：拖动只改本地值，松手才提交。选中行上主色填充会看不见，改反白。 */
function VolumeSlider({
  value,
  onAccent,
  onCommit,
}: {
  value: number;
  onAccent: boolean;
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
      className="h-4 w-24 shrink-0 cursor-pointer"
      style={{ accentColor: onAccent ? "#ffffff" : "var(--app-color-accent)" }}
      onChange={(e) => {
        dirty.current = true;
        setLocal(Number(e.target.value));
      }}
      onPointerUp={() => {
        dirty.current = false;
        if (local !== value) onCommit(local);
      }}
      onKeyUp={() => {
        dirty.current = false;
        if (local !== value) onCommit(local);
      }}
    />
  );
}

/** 空心灰点用 border 画，实心点用背景 */
