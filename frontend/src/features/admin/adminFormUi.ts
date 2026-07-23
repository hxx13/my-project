import { cn } from "@/lib/utils";

export const adminInputClass = cn(
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm",
  "outline-none transition placeholder:text-neutral-400",
  "focus-visible:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25",
);

export const adminLabelClass = "text-xs font-medium text-neutral-600";
export const adminHintClass = "text-[11px] leading-relaxed text-neutral-500";
