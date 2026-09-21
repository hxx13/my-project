import { cn } from "@/lib/utils";

/**
 * 通用红色数字角标：后台侧栏、工作台宫格、H5 底栏/顶栏共用这一枚（`99+` 封顶、空/0 不渲染）。
 *
 * `text` 字符串数字都收：侧栏的 `badgeText` 后端已经格式化过（可能是「99+」），原样塞；
 * 拿到裸数字（未读数）的直接给 number，由这里做封顶，别在各处再抄一遍格式化。
 */
export default function CountBadge({ text, className, title }: {
  text?: string | number | null;
  className?: string;
  title?: string;
}) {
  const raw =
    typeof text === "number"
      ? text > 99 ? "99+" : text > 0 ? String(text) : ""
      : (text ?? "").trim();
  if (!raw) return null;
  return (
    <span
      title={title}
      className={cn(
        "min-w-[1.25rem] shrink-0 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow-sm tabular-nums",
        className,
      )}
    >
      {raw}
    </span>
  );
}
