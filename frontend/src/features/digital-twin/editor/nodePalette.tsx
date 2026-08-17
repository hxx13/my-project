// 节点图元面板：点选三种节点类型，向当前楼层添加一个节点。

import { NODE_KIND_COLOR } from "@/features/digital-twin/render/theme";
import type { NodeKind } from "@/features/digital-twin/schema/types";
import { useDigitalTwinStore } from "./store";

const PALETTE_ITEMS: { kind: NodeKind; label: string }[] = [
  { kind: "equipment", label: "设备" },
  { kind: "acZone", label: "空调区" },
  { kind: "room", label: "房间" },
];

export function NodePalette() {
  const mode = useDigitalTwinStore((s) => s.mode);
  if (mode === "display") return null;

  return (
    <div className="flex h-full w-48 shrink-0 flex-col gap-2 border-r border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--twin-mute)]">图元</div>
      {PALETTE_ITEMS.map((item) => (
        <button
          key={item.kind}
          type="button"
          onClick={() => useDigitalTwinStore.getState().addNode(item.kind)}
          className="flex items-center gap-2.5 rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft-2)] px-3 py-2.5 text-left text-sm text-[var(--twin-ink)] transition-colors hover:border-[var(--twin-hairline-strong)]"
        >
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ background: NODE_KIND_COLOR[item.kind], boxShadow: `0 0 6px ${NODE_KIND_COLOR[item.kind]}` }}
          />
          {item.label}
        </button>
      ))}
    </div>
  );
}
