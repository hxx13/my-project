import { AdminSwitch, type AdminSwitchProps } from "@/components/admin/AdminSwitch";
import { cn } from "@/lib/utils";

/** Layout box of AdminSwitch track (px). */
const SWITCH_W = 51;
const SWITCH_H = 31;

/**
 * Scale tiers aligned with former native checkbox / adjacent label text sizes.
 * - 3 / 3.5 / 4  → w-3 / w-3.5 / w-4 checkboxes (12–16px)
 * - sm / md / lg → text-sm / text-base / standalone toolbar rows
 */
export type AdminSwitchScale = "3" | "3.5" | "4" | "sm" | "md" | "lg";

const SCALE_BY_SIZE: Record<AdminSwitchScale, number> = {
  "3": 12 / SWITCH_W,
  "3.5": 14 / SWITCH_W,
  "4": 16 / SWITCH_W,
  sm: 0.78,
  md: 0.88,
  lg: 1,
};

export type AdminSwitchScaledProps = Omit<AdminSwitchProps, "size"> & {
  /** Visual scale tier — match paired label / table cell density. */
  size?: AdminSwitchScale;
};

/**
 * Wraps AdminSwitch with independent CSS scale (does not modify AdminSwitch internals).
 */
export function AdminSwitchScaled({
  size = "lg",
  className,
  ...props
}: AdminSwitchScaledProps) {
  const factor = SCALE_BY_SIZE[size];
  const boxW = SWITCH_W * factor;
  const boxH = SWITCH_H * factor;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: boxW, height: boxH }}
    >
      <span
        className="inline-flex origin-center"
        style={{ transform: `scale(${factor})` }}
      >
        <AdminSwitch {...props} />
      </span>
    </span>
  );
}
