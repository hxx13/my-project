import { Check } from "lucide-react";

/**
 * 统一的「已选中」标记 —— 绿色实心圆 + 白色对勾。
 *
 * 三处共用这一份：网格格子（`CellButton`）、后台抽屉磁贴、学生端抽屉磁贴，
 * 免得各画一套之后颜色/尺寸/描边慢慢漂移（用户明确要求复用同一枚）。
 * 未选中时给一枚空心圆（可点），这样「还能点选」这件事看得见。
 *
 * 中性描边用 `--twin-*`：这两个令牌定义在 `:root`，两端都取得到，观感一致。
 */
export function SelectCheck({
  checked,
  onToggle,
  size = "md",
  title,
}: {
  checked: boolean;
  /** 不传就是纯展示（不可点）；传了就自己吃掉指针事件，不冒泡给外面的拖拽把手 */
  onToggle?: () => void;
  /** md=网格格子（20px），sm=抽屉磁贴角标（16px） */
  size?: "md" | "sm";
  /** 可访问名与 tooltip */
  title?: string;
}) {
  const dim = size === "md" ? "h-5 w-5" : "h-4 w-4";
  const icon = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={title}
      title={title}
      disabled={!onToggle}
      onClick={onToggle ? (e) => { e.stopPropagation(); onToggle(); } : undefined}
      onPointerDown={onToggle ? (e) => e.stopPropagation() : undefined}
      className={`grid shrink-0 place-items-center rounded-full ${dim} ${
        checked
          ? "bg-emerald-500 text-white shadow ring-2 ring-white/80"
          : "border-2 border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)]/80"
      } ${onToggle ? "cursor-pointer" : "pointer-events-none"}`}
    >
      {checked && <Check className={icon} strokeWidth={3} />}
    </button>
  );
}
