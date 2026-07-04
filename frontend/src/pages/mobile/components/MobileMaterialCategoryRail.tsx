/**
 * H5 申领左侧分类导航 — 紧凑列表，激活态轻量高亮。
 */
import { cn } from "@/lib/utils";

export type MaterialCategoryOption = {
  id: number;
  name: string;
};

type Props = {
  activeCat: "all" | number;
  categories: MaterialCategoryOption[];
  onSelect: (cat: "all" | number) => void;
};

function CategoryButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative mx-1 flex min-h-[32px] w-[calc(100%-8px)] items-center justify-center rounded-[var(--student-radius-sm)] px-1 py-1 text-center text-[10px] leading-tight transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--student-primary)]",
        "motion-reduce:transition-none",
        active
          ? "bg-[var(--student-primary-muted)] font-semibold text-[var(--student-primary)]"
          : "font-normal text-[var(--student-body)] hover:bg-[var(--student-canvas-soft-2)] active:bg-[var(--student-primary-muted)]",
      )}
    >
      {label}
    </button>
  );
}

export function MobileMaterialCategoryRail({ activeCat, categories, onSelect }: Props) {
  return (
    <nav aria-label="物品分类" className="py-0.5">
      <CategoryButton active={activeCat === "all"} label="全部" onClick={() => onSelect("all")} />
      {categories.map((c) => (
        <CategoryButton
          key={c.id}
          active={activeCat === c.id}
          label={c.name}
          onClick={() => onSelect(c.id)}
        />
      ))}
    </nav>
  );
}
