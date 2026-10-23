import { HEALTH_ITCH_LABEL } from "../constants";

/**
 * 「瘙痒」子值开关：点亮 = 该档 + 瘙痒。
 *
 * 健康异常那族统一用紫色（与格子右上角 HEALTH_ABNORMAL 角标同族），
 * 与严重程度档位自身的选中色（主色/蓝/黄/红）区分开；用染色代替勾选框与 ✓。
 */
export function ItchChip({
  on,
  onToggle,
  disabled = false,
  className = "",
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      // 卡片/磁贴本身可能是拖拽或落点，按下就停住，别把手势抢走
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={on ? `已标记「严重程度 + ${HEALTH_ITCH_LABEL}」` : `点亮 = 该档 + ${HEALTH_ITCH_LABEL}`}
      className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold leading-tight transition disabled:cursor-not-allowed disabled:opacity-60 ${
        on
          ? "text-white shadow-sm hover:brightness-110"
          : "border border-[var(--app-color-border-default)] bg-white text-[#6b7280] hover:text-[var(--app-color-text-primary)]"
      } ${className}`}
      style={on ? { backgroundColor: "#8b5cf6" } : undefined}
      aria-pressed={on}
    >
      {HEALTH_ITCH_LABEL}
    </button>
  );
}
