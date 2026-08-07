import type { AgvSpatialElement } from "@/api/domains/agv-analysis.api";

interface ZonePopoverData {
  id: number;
  name: string;
  stationPattern?: string;
  color?: string;
}

interface Props {
  zonePopover: ZonePopoverData;
  zoneEditMode: boolean;
  coordEditMode: boolean;
  creatableTags: string[];
  allTagColors: Record<string, string>;
  zones: AgvSpatialElement[];
  onColorChange: (color: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onTagToggle: (zoneId: number, tag: string, active: boolean) => void;
}

export default function AgvZonePopover({
  zonePopover,
  zoneEditMode,
  coordEditMode,
  creatableTags,
  allTagColors,
  zones,
  onColorChange,
  onEdit,
  onDelete,
  onClose,
  onTagToggle,
}: Props) {
  // 普通查看模式（非编辑模式）
  if (!zoneEditMode && !coordEditMode) {
    return (
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--z-tooltip)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] shadow-lg">
          <span className="text-[12px] font-medium text-[var(--app-color-text-primary)]">
            {zonePopover.name}
          </span>
          <input
            type="color"
            value={zonePopover.color || "#3b82f6"}
            onChange={(e) => onColorChange(e.target.value)}
            className="w-5 h-5 rounded-full border border-[var(--app-color-border-default)] cursor-pointer p-0 overflow-hidden"
            title="更改颜色"
          />
          <button
            onClick={onEdit}
            className="px-3 py-1 rounded-full text-[11px] bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)] hover:opacity-80"
          >
            编辑
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1 rounded-full text-[11px] bg-red-50 text-red-500 hover:bg-red-100"
          >
            删除
          </button>
          <button
            onClick={onClose}
            className="ml-1 w-5 h-5 rounded-full border border-[var(--app-color-border-default)] text-[11px] flex items-center justify-center hover:bg-[var(--app-color-surface-hover)]"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // 编辑模式详情面板
  if (zoneEditMode) {
    return (
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--z-tooltip)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] shadow-lg">
          {/* 颜色指示 */}
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: zonePopover.color || "#3b82f6" }}
          />
          {/* 名称 */}
          <span className="text-[12px] font-semibold text-[var(--app-color-text-primary)] whitespace-nowrap">
            {zonePopover.name}
          </span>
          {/* 颜色选择 */}
          <input
            type="color"
            value={zonePopover.color || "#3b82f6"}
            onChange={(e) => onColorChange(e.target.value)}
            className="w-6 h-6 rounded-full border border-[var(--app-color-border-default)] cursor-pointer p-0 overflow-hidden"
            title="更改颜色"
          />
          {/* 快捷标签 */}
          <div className="flex gap-1">
            {creatableTags.map((tag) => {
              const zoneTags: string[] = (() => {
                try {
                  return JSON.parse(
                    zones.find((z) => z.id === zonePopover.id)?.semanticTags || "[]",
                  );
                } catch {
                  return [];
                }
              })();
              const active = zoneTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => onTagToggle(zonePopover.id, tag, active)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                    active
                      ? "text-white"
                      : "bg-[var(--app-color-surface-page)] text-[var(--app-color-text-tertiary)]"
                  }`}
                  style={active ? { backgroundColor: allTagColors[tag] || "#6b7280" } : {}}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          <span className="w-px h-4 bg-[var(--app-color-border-default)]" />
          {/* 操作 */}
          <button
            onClick={onDelete}
            className="px-3 py-1 rounded-full text-[11px] bg-red-50 text-red-500 hover:bg-red-100 whitespace-nowrap"
          >
            删除
          </button>
          <button
            onClick={onClose}
            className="w-5 h-5 rounded-full border border-[var(--app-color-border-default)] text-[11px] flex items-center justify-center hover:bg-[var(--app-color-surface-hover)]"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return null;
}
