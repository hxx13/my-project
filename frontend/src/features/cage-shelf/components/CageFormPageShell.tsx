import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import "../cage-form.css";

type CageFormPageShellProps = {
  /** 返回目标路径（admin 路径，如 /admin/cage-shelves/forms） */
  backTo: string;
  /** 顶栏右侧操作区（搜索、按钮等） */
  toolbar?: ReactNode;
  children: ReactNode;
};

/**
 * 笼位表单子页统一壳：对齐 student-violations / AdminInventory 紧凑工具栏 + 固定高度填充。
 * 背景沿用 AdminLayout twin canvas；工作台内层面板由 cage-form.css 映射 surface token。
 */
export function CageFormPageShell({ backTo, toolbar, children }: CageFormPageShellProps) {
  const navigate = useNavigate();

  return (
    <AdminPageShell fillHeight className="gap-0">
      <div className="flex min-h-0 flex-1 flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))]">
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--twin-hairline)] pb-2 pt-0.5">
          <button
            type="button"
            onClick={() => navigate(toAdminRoutePath(backTo))}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 text-[13px] font-medium text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft)]"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            返回
          </button>
          {toolbar ? (
            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">{toolbar}</div>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </AdminPageShell>
  );
}

/** 工具栏内定宽搜索框（对齐 violations RecordsToolbar） */
export function CageFormSearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex w-52 shrink-0 items-center gap-2 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-1.5 transition-colors focus-within:border-[var(--app-color-accent)] ${className ?? ""}`}
    >
      <svg
        className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        className="w-full min-w-0 bg-transparent text-[13px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
