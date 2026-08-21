import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { JSX, KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";
import {
  filledTriggerClass,
  filledTriggerErrorClass,
  filledTriggerOpenClass,
} from "./BareControl";
import { useMultiSelectPopover } from "./useMultiSelectPopover";

export type SelectOption<V extends string | number> = {
  value: V;
  label: string;
  desc?: string;
};

type SelectFieldProps<V extends string | number> = {
  options: readonly SelectOption<V>[];
  value: V | "" | null;
  onChange: (next: V) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** 提交校验失败高亮 */
  invalid?: boolean;
};

/**
 * 单选下拉：与 MultiSelectField 同款触发器 + fixed 浮层，但选项为单选（圆点选中态）。
 * 复用 useMultiSelectPopover 定位与关闭行为；键盘上下/回车/Esc 与多选一致。
 * 浮层经 Portal 挂到 body，避免被 PageTransition 残留 transform / 检查器 overflow 裁切。
 * 调用方若需 `<label htmlFor>` 关联，必须透传 `id`（如 `id={controlId}`）。
 */
export function SelectField<V extends string | number>({
  options,
  value,
  onChange,
  placeholder = "未选择",
  disabled = false,
  id,
  invalid = false,
}: SelectFieldProps<V>): JSX.Element {
  const autoId = useId();
  const triggerId = id ?? autoId;
  const listboxId = `${triggerId}-listbox`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const { panelStyle } = useMultiSelectPopover({ triggerRef, panelRef, open, onClose: close });

  const selected = options.find((o) => o.value === value);

  const openPanel = () => {
    if (disabled) return;
    setOpen(true);
  };
  const pick = (v: V) => {
    onChange(v);
    setOpen(false);
  };

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) openPanel();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const handleKeys = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const opt = options[Math.min(activeIndex, options.length - 1)];
      if (opt) pick(opt.value);
    }
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const idx = options.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [open, options, value]);

  const safeIndex = options.length === 0 ? -1 : Math.min(activeIndex, options.length - 1);

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
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={handleTriggerKeyDown}
        aria-invalid={invalid || undefined}
        className={cn(
          filledTriggerClass,
          "flex w-full items-center justify-between gap-1",
          open && filledTriggerOpenClass,
          invalid && filledTriggerErrorClass,
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
      >
        <span className={cn("min-w-0 truncate", selected ? "text-[var(--app-color-text-primary)]" : "text-[var(--app-color-text-tertiary)]")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--app-color-text-secondary)]" />
      </div>

      {open ? (
        <Portal>
          <div
            ref={panelRef}
            role="listbox"
            aria-multiselectable="false"
            aria-activedescendant={safeIndex >= 0 ? `${listboxId}-opt-${safeIndex}` : undefined}
            id={listboxId}
            tabIndex={-1}
            style={panelStyle}
            onKeyDown={handleKeys}
            onClick={(e) => e.stopPropagation()}
            className="max-h-64 overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-1 outline-none [box-shadow:var(--app-elevation-card)]"
          >
            {options.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-[var(--app-color-text-tertiary)]">无选项</div>
            ) : (
              options.map((opt, i) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    id={`${listboxId}-opt-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pick(opt.value)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn("flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5", i === safeIndex ? "bg-[var(--app-color-surface-hover)]" : "")}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none",
                        isSelected ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)] text-white" : "border-[var(--app-color-border-strong)] text-transparent"
                      )}
                    >
                      ✓
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-[var(--app-color-text-primary)]">{opt.label}</span>
                      {opt.desc ? <span className="block text-xs text-[var(--app-color-text-secondary)]">{opt.desc}</span> : null}
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
