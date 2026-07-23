import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export type AnimalRoomConsoleBackButtonProps = {
  onClick: () => void;
  returnToPath?: string | null;
  variant?: "scifi" | "standard";
  className?: string;
};

/** 动物房控制台页共用返回钮：较大箭头，置于 logo 左侧 */
export function AnimalRoomConsoleBackButton({
  onClick,
  returnToPath,
  variant = "scifi",
  className,
}: AnimalRoomConsoleBackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border p-1.5 shadow-sm transition-colors motion-reduce:transition-none sm:p-2",
        variant === "scifi"
          ? "border-cyan-500/35 bg-slate-900/90 text-cyan-50 hover:bg-slate-800/95 active:bg-slate-800"
          : "border-sky-200/90 bg-gradient-to-b from-sky-50 to-white text-sky-900 hover:from-sky-100 hover:to-sky-50 active:from-sky-100",
        className
      )}
      title={returnToPath ? "返回进入前页面" : "返回上一页"}
      aria-label={returnToPath ? "返回进入前页面" : "返回上一页"}
    >
      <ArrowLeft className="h-5 w-5 shrink-0 sm:h-[1.375rem] sm:w-[1.375rem]" aria-hidden />
    </button>
  );
}
