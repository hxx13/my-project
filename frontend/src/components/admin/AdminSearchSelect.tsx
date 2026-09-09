import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminInputClass } from "@/features/admin/adminFormUi";

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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const k = value.trim().toLowerCase();
    if (!k) return options;
    return options.filter((o) => o.toLowerCase().includes(k));
  }, [options, value]);

  const rowCls =
    "block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]";

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
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
        <div className="absolute left-0 top-full z-[var(--z-overlay)] mt-1 max-h-60 w-full min-w-[12rem] overflow-auto rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-1 shadow-lg">
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
      )}
    </div>
  );
}
