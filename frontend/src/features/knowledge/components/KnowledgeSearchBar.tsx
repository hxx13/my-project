import { useState, useCallback } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface KnowledgeSearchBarProps {
  onSearch: (q: string) => void;
  isLoading?: boolean;
}

export function KnowledgeSearchBar({ onSearch, isLoading }: KnowledgeSearchBarProps) {
  const [value, setValue] = useState("");

  const handleChange = useCallback(
    (v: string) => {
      setValue(v);
      onSearch(v);
    },
    [onSearch]
  );

  const clear = () => {
    setValue("");
    onSearch("");
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--app-color-text-tertiary)]" />
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="搜索文档标题或内容..."
        className={cn(
          "w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] py-2 pl-9 pr-8 text-sm text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)]",
          "focus:border-[var(--app-color-border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/25"
        )}
      />
      {value && (
        <button
          onClick={clear}
          className="absolute right-2 top-1/2 size-5 -translate-y-1/2 rounded-full text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"
        >
          <X className="size-4" />
        </button>
      )}
      {isLoading && (
        <div className="absolute right-8 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-[var(--app-color-border-default)] border-t-[var(--app-color-accent)]" />
      )}
    </div>
  );
}
