import { cn } from "@/lib/utils";

/* ================================================================== */
/*  FmStatusTag — 设施检查维护状态小标签                                  */
/*  复用既有 .review-status（圆点 + 文字），色相走 --review-accent 变量，    */
/*  tone 语义与 .review-card[data-tone] 一致，映射只留在 index.css 一处     */
/* ================================================================== */

export type FmTone = "pending" | "ok" | "bad" | "info" | "none";

const STATUS_META: Record<string, { label: string; tone: FmTone }> = {
  DRAFT: { label: "填写中", tone: "pending" },
  SUBMITTED: { label: "已登记", tone: "ok" },
};

export type FmStatusTagProps = {
  status: string;
  className?: string;
};

export function FmStatusTag({ status, className }: FmStatusTagProps) {
  const meta = STATUS_META[status];
  const tone: FmTone = meta?.tone ?? "none";
  return (
    <span className={cn("review-status", className)} data-tone={tone}>
      {meta?.label ?? status}
    </span>
  );
}
