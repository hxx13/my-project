import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { CAGE_MODE_META, type CageModeKey } from "./CageModeIsland";

/**
 * 右侧书签标签栏 —— 「待提交」抽屉关掉后，每个模式留一枚标签挂在页面右边缘，
 * 点谁就把页面切到那个模式并展开它的抽屉。参照订购页的 CagePickerTab（同一颗标签语言）。
 *
 * 只列**有抽屉的模式**：查看/记录/预约没有待提交缓冲，给它们挂标签点了也是空抽屉。
 * 抽屉开着时整条标签栏由页面隐藏（抽屉自带收纳把手），避免和抽屉抢右边缘。
 */
const DRAWER_MODES: CageModeKey[] = ["allocate", "reserve", "division", "edit", "confirm", "archive"];

/** 标签顶距：要让开内容区顶部那排工具栏（收藏/筛选/全房间/图例/设置…），别压在上面 */
const TABS_TOP = 140;

export default function CageModeTabs({
  allowed,
  counts,
  onPick,
}: {
  /** 有权限的模式（allowedModeKeys） */
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
        const color = meta?.color || "var(--twin-primary)";
        const n = counts[key] ?? 0;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key)}
            title={`展开「${label}」待提交`}
            style={{ borderLeftWidth: 3, borderLeftColor: color }}
            className="flex w-6 flex-col items-center gap-1 rounded-l-twin-md border border-r-0 border-[var(--twin-hairline)] bg-[var(--twin-canvas)] py-1.5 shadow hover:bg-[var(--twin-canvas-soft)]"
          >
            <span className="text-[11px] font-semibold leading-none text-[var(--twin-ink)] [writing-mode:vertical-rl]">
              {label}
            </span>
            {n > 0 && (
              <span className="rounded-full px-1 text-[10px] font-bold leading-4 text-white" style={{ backgroundColor: color }}>
                {n}
              </span>
            )}
            <ChevronLeft className="h-3 w-3 shrink-0 text-[var(--twin-mute)]" />
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
