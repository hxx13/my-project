import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminToolbarSearchFieldProps = {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  /** 回车或点击放大镜时触发（与后台列表「查询」一致） */
  onSubmit: () => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
};

/**
 * 站内统一搜索框：与后台列表页一致的边框、高度（--admin-control-height）、左侧搜索图标。
 * 受控模式；回车提交；右侧可点击放大镜重复提交。
 */
export function AdminToolbarSearchField({
  placeholder = "搜索…",
  value,
  onChange,
  onSubmit,
  className,
  disabled,
  id,
  "aria-label": ariaLabel,
}: AdminToolbarSearchFieldProps) {
  return (
    <div data-twin-debug-admin-search className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        id={id}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder}
        className="h-[var(--admin-control-height,2.25rem)] w-full min-w-0 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-10 text-sm text-slate-900 shadow-sm outline-none ring-slate-200 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <button
        type="button"
        disabled={disabled}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600 disabled:pointer-events-none disabled:opacity-40"
        aria-label="搜索"
        onClick={() => onSubmit()}
      >
        <Search className="h-4 w-4" />
      </button>
    </div>
  );
}
