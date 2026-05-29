import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewToggleProps {
  value: "card" | "list";
  onChange: (view: "card" | "list") => void;
}

const buttonBase =
  "inline-flex h-[32px] w-[32px] items-center justify-center rounded-[6px] transition-colors";

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex gap-[6px]">
      <button
        type="button"
        onClick={() => onChange("card")}
        className={cn(
          buttonBase,
          value === "card"
            ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)]"
            : "text-[var(--student-mute)] hover:bg-[var(--student-canvas-soft)]",
        )}
        aria-label="网格视图"
      >
        <LayoutGrid className="h-[16px] w-[16px]" />
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        className={cn(
          buttonBase,
          value === "list"
            ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)]"
            : "text-[var(--student-mute)] hover:bg-[var(--student-canvas-soft)]",
        )}
        aria-label="列表视图"
      >
        <List className="h-[16px] w-[16px]" />
      </button>
    </div>
  );
}

export type { ViewToggleProps };
