import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "./ThemeProvider";
import { Sun, Moon, Sparkles, Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_LIGHT_END,
  DEFAULT_LIGHT_START,
  formatScheduleTimeForInput,
  parseScheduleTimeFromInput,
} from "./themeSchedule";

const iconMap: Record<string, typeof Sun> = {
  standard: Sun,
  "standard-dark": Moon,
  scifi: Sparkles,
};

const MENU_GAP = 6;
const VIEWPORT_PAD = 8;
/** 首帧测量前的高度估计（程序坞贴底时用于预判向上展开） */
const MENU_EST_HEIGHT = 240;

function computeMenuStyle(trigger: DOMRect, menu: DOMRect | null): CSSProperties {
  const menuHeight = menu?.height ?? MENU_EST_HEIGHT;
  const menuWidth = menu?.width ?? 208;

  const spaceBelow = window.innerHeight - trigger.bottom - MENU_GAP - VIEWPORT_PAD;
  const spaceAbove = trigger.top - MENU_GAP - VIEWPORT_PAD;

  const wouldClipBelow =
    trigger.bottom + MENU_GAP + menuHeight > window.innerHeight - VIEWPORT_PAD;
  const openAbove =
    (spaceBelow < menuHeight && spaceAbove >= spaceBelow) ||
    (wouldClipBelow && spaceAbove > spaceBelow);

  const maxHeight = Math.max(120, openAbove ? spaceAbove : spaceBelow);

  let right = window.innerWidth - trigger.right;
  right = Math.max(VIEWPORT_PAD, Math.min(right, window.innerWidth - menuWidth - VIEWPORT_PAD));

  const base: CSSProperties = {
    position: "fixed",
    right,
    maxHeight,
    overflowY: "auto",
    visibility: menu ? "visible" : "hidden",
  };

  if (openAbove) {
    return { ...base, bottom: window.innerHeight - trigger.top + MENU_GAP };
  }
  return { ...base, top: trigger.bottom + MENU_GAP };
}

export function ThemeSwitcher({ className }: { className?: string }) {
  const {
    themeId,
    theme,
    effectiveMode,
    autoScheduleEnabled,
    setAutoScheduleEnabled,
    toggleLightDark,
    setThemeId,
    themes,
    lightStart,
    lightEnd,
    setScheduleTimes,
  } = useTheme();
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const [draftStart, setDraftStart] = useState(() => formatScheduleTimeForInput(lightStart));
  const [draftEnd, setDraftEnd] = useState(() => formatScheduleTimeForInput(lightEnd));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const Icon = iconMap[themeId] || (effectiveMode === "light" ? Sun : Moon);

  useEffect(() => {
    if (!open) return;
    setDraftStart(formatScheduleTimeForInput(lightStart));
    setDraftEnd(formatScheduleTimeForInput(lightEnd));
  }, [open, lightStart, lightEnd]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuStyle(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect() ?? null;
      setMenuStyle(computeMenuStyle(triggerRect, menuRect));
    };

    updatePosition();

    const menuEl = menuRef.current;
    const ro = menuEl ? new ResizeObserver(updatePosition) : null;
    if (menuEl) ro?.observe(menuEl);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, autoScheduleEnabled, themeId, themes.length]);

  const commitScheduleTimes = (start: string, end: string) => {
    const s = parseScheduleTimeFromInput(start);
    const e = parseScheduleTimeFromInput(end);
    if (!s || !e) return;
    if (s === formatScheduleTimeForInput(lightStart) && e === formatScheduleTimeForInput(lightEnd)) return;
    setScheduleTimes(s, e);
  };

  const scheduleSummaryStart = formatScheduleTimeForInput(lightStart || DEFAULT_LIGHT_START);
  const scheduleSummaryEnd = formatScheduleTimeForInput(lightEnd || DEFAULT_LIGHT_END);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[var(--app-radius-element)] px-2 py-1.5 text-[var(--app-color-text-secondary)]",
          "hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]",
          "transition-all duration-150",
          className
        )}
        title={`当前：${theme.label}${autoScheduleEnabled ? "（定时自动）" : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Icon className="size-4" />
        <span className="text-xs font-medium">{theme.label}</span>
        {autoScheduleEnabled ? <Clock className="size-3 opacity-60" aria-hidden /> : null}
        <ChevronDown className={cn("size-3 opacity-60 transition", open && "rotate-180")} aria-hidden />
      </button>

      {open
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[calc(var(--z-sticky)-1)] cursor-default bg-transparent"
                aria-label="关闭主题菜单"
                onClick={() => setOpen(false)}
              />
              <div
                ref={menuRef}
                role="menu"
                className="fixed z-[var(--z-sticky)] min-w-[13rem] max-w-[min(92vw,16rem)] rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-1 shadow-[var(--app-shadow-elevated)] overscroll-contain"
                style={
                  menuStyle ?? {
                    position: "fixed",
                    top: 0,
                    right: 0,
                    visibility: "hidden",
                    pointerEvents: "none",
                  }
                }
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-[var(--app-radius-element)] px-2 py-1.5 text-left text-xs text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]"
                  onClick={() => {
                    toggleLightDark();
                    setOpen(false);
                  }}
                >
                  {effectiveMode === "light" ? (
                    <Moon className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <Sun className="size-3.5 shrink-0" aria-hidden />
                  )}
                  <span>切换为{effectiveMode === "light" ? "暗色" : "亮色"}</span>
                </button>

                <label className="flex cursor-pointer items-center gap-2 rounded-[var(--app-radius-element)] px-2 py-1.5 text-xs text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-[var(--app-color-border-default)]"
                    checked={autoScheduleEnabled}
                    onChange={(e) => setAutoScheduleEnabled(e.target.checked)}
                  />
                  <span className="min-w-0 flex-1 leading-snug">
                    定时自动切换
                    <span className="block text-[10px] text-[var(--app-color-text-tertiary)]">
                      {scheduleSummaryStart}–{scheduleSummaryEnd} 亮色
                    </span>
                  </span>
                </label>

                {autoScheduleEnabled ? (
                  <div className="space-y-1 border-t border-[var(--app-color-border-default)] px-2 py-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--app-color-text-tertiary)]">
                      亮色时段
                    </p>
                    <div className="flex items-center gap-1">
                      <input
                        type="time"
                        value={draftStart}
                        onChange={(e) => setDraftStart(e.target.value)}
                        onBlur={() => commitScheduleTimes(draftStart, draftEnd)}
                        className="min-w-0 flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1 py-0.5 text-[11px] text-[var(--app-color-text-primary)]"
                        aria-label="亮色开始时间"
                      />
                      <span className="text-[10px] text-[var(--app-color-text-tertiary)]">至</span>
                      <input
                        type="time"
                        value={draftEnd}
                        onChange={(e) => setDraftEnd(e.target.value)}
                        onBlur={() => commitScheduleTimes(draftStart, draftEnd)}
                        className="min-w-0 flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-1 py-0.5 text-[11px] text-[var(--app-color-text-primary)]"
                        aria-label="亮色结束时间"
                      />
                    </div>
                  </div>
                ) : null}

                {!autoScheduleEnabled ? (
                  <div className="mt-1 border-t border-[var(--app-color-border-default)] pt-1">
                    <p className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--app-color-text-tertiary)]">
                      主题
                    </p>
                    {themes.map((t) => {
                      const TIcon = iconMap[t.id] || Sun;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="menuitem"
                          className={cn(
                            "flex w-full items-center gap-2 rounded-[var(--app-radius-element)] px-2 py-1.5 text-left text-xs hover:bg-[var(--app-color-surface-hover)]",
                            themeId === t.id
                              ? "font-semibold text-[var(--app-color-accent-secondary)]"
                              : "text-[var(--app-color-text-primary)]"
                          )}
                          onClick={() => {
                            setThemeId(t.id);
                            setOpen(false);
                          }}
                        >
                          <TIcon className="size-3.5 shrink-0" aria-hidden />
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}
