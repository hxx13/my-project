import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { CAGE_MODE_META, type CageModeKey } from "@/features/cage-shelf/components/CageModeIsland";

/**
 * 学生端右边缘书签标签栏 —— 与管理端 `CageModeTabs` 同构、同交互，
 * 但皮是学生端令牌那一套（`--app-color-*` / `rounded-student-*`），与管理端组件不共用。
 *
 * 只列**有抽屉的模式**：查看/确认没有待提交缓冲，挂标签点了也是空抽屉。
 * 抽屉开着时整条标签栏由页面隐藏（抽屉自带收纳把手），避免和抽屉抢右边缘。
 */
const DRAWER_MODES: CageModeKey[] = ["studentClaim", "division"];

/** 标签顶距：让开内容区顶部那排工具栏（扫码/特殊状态/图例…），别压在上面 */
const TABS_TOP = 140;

export default function StudentModeTabs({
  allowed,
  counts,
  onPick,
}: {
  /** 有权限的模式（islandModes） */
  allowed: string[];
  /** 各模式待提交条数；0/缺省不显示数字 */
  counts: Partial<Record<CageModeKey, number>>;
  onPick: (key: CageModeKey) => void;
}) {
  const modes = DRAWER_MODES.filter((k) => allowed.includes(k));
  if (modes.length === 0) return null;
  return createPortal(
    <div style={{ position: "fixed", top: TABS_TOP, right: 0, zIndex: 40 }} className="flex flex-col items-end gap-1.5">
      {modes.map((key) => {
        const meta = CAGE_MODE_META.find((m) => m.key === key);
        const label = meta?.label ?? key;
        const color = meta?.color || "var(--app-color-accent-hover)";
        const n = counts[key] ?? 0;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key)}
            title={`展开「${label}」待提交`}
            style={{ borderLeftWidth: 3, borderLeftColor: color }}
            className="flex w-6 flex-col items-center gap-1 rounded-l-student-md border border-r-0 border-[var(--app-color-border-default)] bg-[var(--student-canvas)] py-1.5 shadow hover:bg-[var(--app-color-surface-hover)]"
          >
            <span className="text-[11px] font-semibold leading-none text-[var(--app-color-text-primary)] [writing-mode:vertical-rl]">
              {label}
            </span>
            {n > 0 && (
              <span className="rounded-full px-1 text-[10px] font-bold leading-4 text-white" style={{ backgroundColor: color }}>
                {n}
              </span>
            )}
            <ChevronLeft className="h-3 w-3 shrink-0 text-[var(--app-color-text-tertiary)]" />
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
