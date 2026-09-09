import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Portal } from "@/components/Portal";
import { adminInputClass } from "@/features/admin/adminFormUi";
import { useMultiSelectPopover } from "@/features/admin/violations/shared/useMultiSelectPopover";

type AdminSearchSelectProps = {
  value: string;
  onChange: (v: string) => void;
  /** 候选值。输入的内容不限于候选，可直接作为模糊筛选值提交。 */
  options: readonly string[];
  /** 空值时的占位，默认「全部」 */
  placeholder?: string;
  className?: string;
  id?: string;
};

/**
 * 筛选型下拉输入框：可直接输入关键字（后端按 LIKE 模糊匹配），也可从候选列表点选。
 * 用于候选值过多（数百条）时替代原生 select。
 *
 * 浮层经 Portal 以 fixed 定位挂到 body（复用 useMultiSelectPopover）：
 * 弹窗/表格等 overflow 容器内不会被裁切，下方放不下会自动翻到上方。
 */
export function AdminSearchSelect({
  value,
  onChange,
  options,
  placeholder = "全部",
  className,
  id,
}: AdminSearchSelectProps) {
  const [open, setOpen] = useState(false);
  /** 本次打开后是否手输过：未输入时展示全部候选，避免「已填值把候选滤成一条」 */
  const [typed, setTyped] = useState(false);
  const triggerRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { panelStyle } = useMultiSelectPopover({ triggerRef, panelRef, open, onClose: close });

  const filtered = useMemo(() => {
    const k = value.trim().toLowerCase();
    if (!typed || !k) return options;
    return options.filter((o) => o.toLowerCase().includes(k));
  }, [options, value, typed]);

  const rowCls =
    "block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]";

  return (
    <div className="relative">
      <input
        ref={triggerRef}
        id={id}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setTyped(true);
        }}
        onFocus={() => {
          setOpen(true);
          setTyped(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Enter") setOpen(false);
        }}
        className={cn(adminInputClass, "pr-7", className)}
      />
      {value ? (
        <button
          type="button"
          aria-label="清除"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-color-text-tertiary)]" />
      )}

      {open && filtered.length > 0 && (
        <Portal>
          <div
            ref={panelRef}
            style={panelStyle}
            className="max-h-60 overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-1 shadow-lg"
          >
            <button type="button" className={cn(rowCls, "text-[var(--app-color-text-tertiary)]")} onClick={() => { onChange(""); setOpen(false); }}>
              {placeholder}
            </button>
            {filtered.map((o) => (
              <button
                key={o}
                type="button"
                title={o}
                className={cn(rowCls, o === value && "bg-[var(--app-color-surface-hover)] font-medium")}
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
              >
                {o}
              </button>
            ))}
          </div>
        </Portal>
      )}
    </div>
  );
}
