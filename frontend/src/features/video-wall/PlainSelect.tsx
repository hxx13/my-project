/**
 * PlainSelect — 普通的单选下拉：**按钮式触发**（显示当前值 + 箭头），
 * 搜索框放在浮层里面，不是让触发框本身变成可输入。
 *
 * 与 `AdminSearchSelect` 的区别正是这一点：那个的触发框本身是个输入框（可手输模糊值），
 * 适合「候选过多、允许自定义值」的筛选场景；这里是「只能从候选中选」的语义，
 * 所以触发框保持下拉的样子，搜索收进浮层。
 *
 * 浮层走 Portal + useMultiSelectPopover，弹窗/滚动容器里不会被裁切。
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { ChevronDown, Search } from "lucide-react";
import { Portal } from "@/components/Portal";
import { useMultiSelectPopover } from "@/features/admin/violations/shared/useMultiSelectPopover";
import { cn } from "@/lib/utils";

export type PlainSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  /** 未选中时的提示 */
  placeholder?: string;
  /** 浮层搜索框的提示，默认取自 placeholder */
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  /** 去掉浮层里那行「清空」 */
  hideClear?: boolean;
  clearLabel?: string;
  /** 每次展开时回调：候选项可能在别处被改过，展开即刷新 */
  onOpen?: () => void;
  /** 每项右侧的操作区（重命名/删除之类）。传了才渲染，且此时该项不再整行按钮化以免嵌套 */
  renderItemActions?: (value: string) => React.ReactNode;
  id?: string;
};

export function PlainSelect({
  value,
  onChange,
  options,
  placeholder = "请选择",
  searchPlaceholder,
  className,
  disabled = false,
  hideClear = false,
  clearLabel,
  onOpen,
  renderItemActions,
  id,
}: PlainSelectProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { panelStyle } = useMultiSelectPopover({ triggerRef, panelRef, open, onClose: close });

  /**
   * 浮层搜索框要不要自动聚焦。
   *
   * <p>**触屏设备上不能自动聚焦**：平板一点开下拉就会弹软键盘，视口被顶起来，
   * 浮层被挤出屏幕/被当成「点外面」关掉 —— 表现是「点预设打不开，还总弹键盘」。
   * 有实体指针（鼠标/触控板）时自动聚焦仍然好用，所以按主要指针类型区分。
   */
  const autoFocusSearch = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(pointer: fine)").matches;
  }, []);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return k ? options.filter((o) => o.toLowerCase().includes(k)) : options;
  }, [options, keyword]);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={triggerRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (disabled) return;
          setKeyword("");
          if (!open) onOpen?.();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setKeyword("");
            if (!open) onOpen?.();
            setOpen((v) => !v);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 text-sm",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[var(--app-color-surface-hover)]"
        )}
      >
        <span
          className={cn(
            "min-w-0 truncate",
            value ? "text-[var(--app-color-text-primary)]" : "text-[var(--app-color-text-tertiary)]"
          )}
        >
          {value || placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--app-color-text-tertiary)]" />
      </div>

      {open && (
        <Portal>
          <div
            ref={panelRef}
            style={panelStyle}
            className="max-h-72 overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-1 shadow-lg"
          >
            <div className="sticky top-0 z-[1] mb-1 bg-[var(--app-color-surface-elevated)] px-1 pb-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-color-text-tertiary)]" />
                <input
                  autoFocus={autoFocusSearch}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={searchPlaceholder ?? `搜索${placeholder}`}
                  className="h-8 w-full rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] pl-7 pr-2 text-[12px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]"
                />
              </div>
            </div>
            {!hideClear && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  close();
                }}
                className="mb-1 flex w-full items-center rounded-md px-2 py-1 text-left text-[12px] text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"
              >
                {clearLabel ?? placeholder}
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-[var(--app-color-text-tertiary)]">没有匹配项</div>
            ) : (
              filtered.map((o) => (
                <div
                  key={o}
                  className="flex items-center gap-1 rounded-md hover:bg-[var(--app-color-surface-hover)]"
                >
                  <button
                    type="button"
                    title={o}
                    onClick={() => {
                      onChange(o);
                      close();
                    }}
                    className={cn(
                      "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-[12px]",
                      o === value
                        ? "font-medium text-[var(--app-color-accent)]"
                        : "text-[var(--app-color-text-primary)]"
                    )}
                  >
                    {o}
                  </button>
                  {renderItemActions?.(o)}
                </div>
              ))
            )}
          </div>
        </Portal>
      )}
    </div>
  );
}

export default PlainSelect;
