import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { JSX, KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";
import {
  bareControlClass,
  filledTriggerClass,
  filledTriggerErrorClass,
  filledTriggerOpenClass,
} from "./BareControl";
import { filterOptions, summarizeChips, toggleValue } from "./multiSelectModel";
import type { MultiSelectOption } from "./multiSelectModel";
import { useMultiSelectPopover } from "./useMultiSelectPopover";

type MultiSelectFieldProps<V extends string> = {
  options: MultiSelectOption<V>[];
  value: V[];
  onChange: (next: V[]) => void;
  placeholder?: string;
  searchable?: boolean;
  /**
   * 选项数超过该阈值才显示面板内搜索框；默认 6。
   * 传 0 表示只要 searchable 就始终显示（适合课题组成员等需即时检索的场景）。
   */
  searchThreshold?: number;
  maxChips?: number;
  disabled?: boolean;
  id?: string;
  /** 提交校验失败高亮 */
  invalid?: boolean;
};

type Tone = NonNullable<MultiSelectOption<string>["tone"]>;

const TONE_CHIP: Record<Tone, string> = {
  default: "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-primary)]",
  danger: "border-[var(--app-color-feedback-danger)]/40 bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger)]",
  info: "border-[var(--app-color-feedback-info)]/40 bg-[var(--app-color-feedback-info-soft)] text-[var(--app-color-feedback-info)]",
  ok: "border-[var(--app-color-feedback-success)]/40 bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)]",
  warn: "border-[var(--app-color-feedback-warning)]/40 bg-[var(--app-color-feedback-warning-soft)] text-[var(--app-color-feedback-warning)]",
};

/**
 * 多选下拉，用于把检查器里的多组开关/checkbox 合并为单个多选。
 * 浮层经 Portal 挂到 body，避免被 PageTransition 残留 transform / 检查器 overflow 裁切。
 * 调用方若需 `<label htmlFor>` 关联，必须透传 `id`（如 `id={controlId}`），否则 label 关联断裂。
 */
export function MultiSelectField<V extends string>({
  options, value, onChange,
  placeholder = "未选择", searchable = true, searchThreshold = 6, maxChips = 2, disabled = false, id,
  invalid = false,
}: MultiSelectFieldProps<V>): JSX.Element {
  const autoId = useId();
  const triggerId = id ?? autoId;
  const listboxId = `${triggerId}-listbox`;
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const showSearch = searchable && options.length > searchThreshold;
  const filtered = useMemo(() => filterOptions(options, keyword), [options, keyword]);
  const { chips, overflow } = useMemo(() => summarizeChips(options, value, maxChips), [options, value, maxChips]);

  const close = useCallback(() => {
    setOpen(false);
    setKeyword("");
  }, []);
  const closeAndRestoreFocus = useCallback(() => {
    close();
    triggerRef.current?.focus();
  }, [close]);
  const { panelStyle } = useMultiSelectPopover({ triggerRef, panelRef, open, onClose: close });

  const openPanel = () => { if (disabled) return; setKeyword(""); setActiveIndex(0); setOpen(true); };
  const toggle = (v: V) => onChange(toggleValue(value, v));
  const remove = (v: V) => onChange(value.filter((x) => x !== v));

  useEffect(() => {
    if (!open) return;
    if (showSearch) searchRef.current?.focus();
    else panelRef.current?.focus();
  }, [open, showSearch]);

  const safeIndex = filtered.length === 0 ? -1 : Math.min(activeIndex, filtered.length - 1);

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) openPanel();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      closeAndRestoreFocus();
    }
  };

  // 面板与搜索框共用：上下键移动高亮、Enter 切换、Escape 关闭并归还焦点。
  // 搜索框里按上下键仍能移动列表高亮（业界惯例）；stopPropagation 阻止面板重复处理。
  const handleKeys = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeAndRestoreFocus();
      return;
    }
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const opt = filtered[safeIndex];
      if (opt) toggle(opt.value);
    }
  };

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        id={triggerId}
        tabIndex={disabled ? -1 : 0}
        onClick={() => (open ? closeAndRestoreFocus() : openPanel())}
        onKeyDown={handleTriggerKeyDown}
        aria-invalid={invalid || undefined}
        className={cn(
          filledTriggerClass,
          "flex w-full flex-wrap items-center gap-1",
          open && filledTriggerOpenClass,
          invalid && filledTriggerErrorClass,
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
      >
        {chips.length === 0 ? (
          <span className="text-[var(--app-color-text-tertiary)]">{placeholder}</span>
        ) : (
          <>
            {chips.map((opt) => (
              <span key={opt.value} className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs leading-none", TONE_CHIP[opt.tone ?? "default"])}>
                {opt.label}
                <button type="button" aria-label={`移除 ${opt.label}`} onClick={(e) => { e.stopPropagation(); remove(opt.value); }} className="cursor-pointer rounded-sm text-current opacity-70 hover:opacity-100">
                  ×
                </button>
              </span>
            ))}
            {overflow > 0 ? (
              <span className="text-xs text-[var(--app-color-text-tertiary)]">+{overflow}</span>
            ) : null}
          </>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--app-color-text-secondary)]" />
      </div>

      {open ? (
        <Portal>
          <div
            ref={panelRef}
            role="listbox"
            aria-multiselectable="true"
            aria-activedescendant={safeIndex >= 0 ? `${listboxId}-opt-${safeIndex}` : undefined}
            id={listboxId}
            tabIndex={-1}
            style={panelStyle}
            onKeyDown={handleKeys}
            onClick={(e) => e.stopPropagation()}
            className="max-h-64 max-w-72 overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-1 [box-shadow:var(--app-elevation-card)]"
          >
            {showSearch ? (
              <input
                ref={searchRef}
                type="text"
                value={keyword}
                placeholder="搜索…"
                onKeyDown={handleKeys}
                onChange={(e) => { setKeyword(e.target.value); setActiveIndex(0); }}
                className={cn(bareControlClass, "mb-1 w-full")}
              />
            ) : null}
            {filtered.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-[var(--app-color-text-tertiary)]">无匹配项</div>
            ) : (
              filtered.map((opt, i) => {
                const selected = value.includes(opt.value);
                return (
                  <div key={opt.value} id={`${listboxId}-opt-${i}`} role="option" aria-selected={selected} onClick={() => toggle(opt.value)} onMouseEnter={() => setActiveIndex(i)} className={cn("flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5", i === safeIndex ? "bg-[var(--app-color-surface-hover)]" : "")}>
                    <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none", selected ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)] text-white" : "border-[var(--app-color-border-strong)] text-transparent")}>
                      ✓
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-[var(--app-color-text-primary)]">{opt.label}</span>
                      {opt.desc ? (
                        <span className="block text-xs text-[var(--app-color-text-secondary)]">{opt.desc}</span>
                      ) : null}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </Portal>
      ) : null}
    </div>
  );
}
