import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Portal } from "@/components/Portal";
import { FILE_GROUPS, stationSupports } from "./printableTypes";
import type { PrintStationOption } from "@/api/domains/print.api";
// 跨目录引 useMultiSelectPopover：这是全仓唯一的 fixed 定位浮层原语（Portal 挂 body），
// AdminSearchSelect / SelectField 都包它。SelectField 更近，但它的选项只能渲染
// {label, desc}，塞不下「每行一个状态点 + 支持类型 + 离线原因」，所以这里直接用原语，
// 定位 / 越界翻转 / 点击外部与 Escape 关闭这几件事不重写。
import { useMultiSelectPopover } from "@/features/admin/violations/shared/useMultiSelectPopover";

/** 连接三态 → .review-status 圆点的 tone。与 AdminPrintStationsPage 的 LIVE_STATUS_VIEW 同口径。 */
const LIVE_TONE: Record<PrintStationOption["liveStatus"], string> = {
  ONLINE: "ok",
  OFFLINE: "bad",
  UNKNOWN: "none",
};

interface StationPickerProps {
  /** null = 还在加载；[] = 没有可选的工位。与派发弹窗里的 stations 状态同源。 */
  stations: PrintStationOption[] | null;
  /** 选中的工位 id（空串 = 还没选） */
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

/** 触发器跟派发弹窗其它输入框一样：app-color 令牌 + 圆角边框。 */
const triggerCls =
  "flex w-full items-center gap-2 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1.5 text-[13px] text-[var(--app-color-text-primary)] outline-none transition-colors hover:border-[var(--app-color-border-strong)]";

/**
 * 派发打印里的工位选择器：浮层下拉，每行带在线状态点 + 支持类型 +（离线时）原因。
 *
 * 离线的**不拦**，照样可选，只标红 —— 健康判定有假阴性（探测刚重启还没跑过、
 * 心跳刚断但页面其实活着），拦了会把人在能打的时候堵死。
 */
export function StationPicker({ stations, value, onChange, placeholder = "选择打印机" }: StationPickerProps) {
  const list = stations ?? [];
  const loading = stations === null;
  const disabled = loading || list.length === 0;
  const selected = list.find((s) => s.id === value) ?? null;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  const { panelStyle } = useMultiSelectPopover({ triggerRef, panelRef, open, onClose: close });

  const listboxId = useId();

  const openPanel = () => {
    if (disabled) return;
    setOpen(true);
  };
  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  // 打开即把焦点交给浮层，键盘上下/回车才能接着用；activeIndex 落在当前选中项上。
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const idx = list.findIndex((s) => s.id === value);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [open, list, value]);

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) openPanel();
    }
  };

  const handlePanelKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (list.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % list.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + list.length) % list.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = list[Math.min(activeIndex, list.length - 1)];
      if (s) pick(s.id);
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={handleTriggerKeyDown}
        className={cn(triggerCls, disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}
      >
        {selected ? (
          <>
            <span className="review-status shrink-0" data-tone={LIVE_TONE[selected.liveStatus] ?? "none"} />
            <span className="min-w-0 flex-1 truncate text-left">{selected.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-left text-[var(--app-color-text-tertiary)]">
            {loading ? "加载中…" : list.length === 0 ? "没有可用的打印机" : placeholder}
          </span>
        )}
        <ChevronDown className="ml-auto size-3.5 shrink-0 text-[var(--app-color-text-secondary)]" />
      </button>

      {open && (
        <Portal>
          <div
            ref={panelRef}
            role="listbox"
            id={listboxId}
            tabIndex={-1}
            style={panelStyle}
            onKeyDown={handlePanelKeys}
            onClick={(e) => e.stopPropagation()}
            className="max-h-64 overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-1 outline-none [box-shadow:var(--app-elevation-card)]"
          >
            {list.map((s, i) => {
              const offline = s.liveStatus === "OFFLINE";
              return (
                <div
                  key={s.id}
                  role="option"
                  aria-selected={s.id === value}
                  onClick={() => pick(s.id)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn("cursor-pointer rounded-md px-2 py-1.5", i === activeIndex && "bg-[var(--app-color-surface-hover)]")}
                >
                  <div className="flex items-center gap-2">
                    <span className="review-status shrink-0" data-tone={LIVE_TONE[s.liveStatus] ?? "none"} />
                    <span className={cn("min-w-0 truncate text-sm text-[var(--app-color-text-primary)]", s.id === value && "font-medium")}>
                      {s.name}
                    </span>
                  </div>

                  {/* 支持类型：与工位列表同一套红绿灯。空 = 未限制 = 全支持 */}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-4">
                    {FILE_GROUPS.map((g) => {
                      const on = stationSupports(s.supportedTypes, g.key);
                      return (
                        <span
                          key={g.key}
                          className={
                            "inline-flex items-center gap-1 text-[11px] " +
                            (on ? "text-[var(--app-color-feedback-success)]" : "text-[var(--app-color-text-tertiary)] opacity-60")
                          }
                        >
                          <span
                            className={
                              "size-2 shrink-0 rounded-full " +
                              (on ? "bg-[var(--app-color-feedback-success)]" : "bg-[var(--app-color-text-tertiary)] opacity-50")
                            }
                          />
                          {g.label}
                        </span>
                      );
                    })}
                    {!s.supportedTypes?.trim() ? (
                      <span className="text-[11px] text-[var(--app-color-text-tertiary)]">（未限制）</span>
                    ) : null}
                  </div>

                  {offline && s.liveStatusReason ? (
                    <div className="mt-0.5 pl-4 text-[11px] text-[var(--app-color-text-tertiary)]">{s.liveStatusReason}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Portal>
      )}
    </div>
  );
}

export default StationPicker;
