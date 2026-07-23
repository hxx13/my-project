export type SwingDirectionFilter = "" | "ALL" | "ENTER" | "EXIT";

export const SWING_DIRECTION_OPTIONS: { value: SwingDirectionFilter; label: string }[] = [
  { value: "", label: "全部" },
  { value: "ENTER", label: "进入" },
  { value: "EXIT", label: "离开" },
];

export function enterOrExitFromFilter(filter: SwingDirectionFilter): number | undefined {
  if (filter === "ENTER") return 1;
  if (filter === "EXIT") return 2;
  return undefined;
}

export function filterFromEnterOrExit(v?: number): SwingDirectionFilter {
  if (v === 1) return "ENTER";
  if (v === 2) return "EXIT";
  return "";
}

export function labelEnterOrExit(v?: number): string {
  if (v === 1) return "进入";
  if (v === 2) return "离开";
  return "未知";
}

export function labelSwingDirectionFilter(filter?: string): string {
  if (filter === "ENTER") return "仅进入";
  if (filter === "EXIT") return "仅离开";
  return "进出：全部";
}
