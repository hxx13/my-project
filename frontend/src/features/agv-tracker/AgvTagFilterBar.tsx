import type { AgvSpatialElement } from "@/api/domains/agv-analysis.api";
import { AGV_ZONE_MAP } from "@/features/agv-tracker/zoneGrouping";
import { AGV_ROBOTS } from "@/features/agv-tracker/agvRobotConfig";

const ROBOTS = AGV_ROBOTS;

const ROUTE_TAGS = [
  { key: "TRANSPORT", label: "运输", color: "#3b82f6" },
  { key: "STATION_WORK", label: "载货", color: "#f59e0b" },
  { key: "REST", label: "充电", color: "#22c55e" },
  { key: "NAVIGATING", label: "寻路", color: "#6b7280" },
];

interface Props {
  showZones: boolean;
  routeMode: boolean;
  zones: AgvSpatialElement[];
  tagControlIp: string;
  hiddenRouteTypes: Set<string>;
  onToggleRouteType: (type: string) => void;
  hiddenAgvs: Set<string>;
  onToggleAgvVisibility: (ip: string) => void;
  allTagOptions: string[];
  hiddenTagsByIp: Record<string, Set<string>>;
}

export default function AgvTagFilterBar({
  showZones,
  routeMode,
  zones,
  tagControlIp,
  hiddenRouteTypes,
  onToggleRouteType,
  hiddenAgvs,
  onToggleAgvVisibility,
  allTagOptions,
  hiddenTagsByIp,
}: Props) {
  const showZoneBar = showZones && zones.length > 0;
  const showRouteBar = routeMode;
  if (!showZoneBar && !showRouteBar) return null;

  // 当前标签控制目标车的 zone group
  const controlGroup = AGV_ZONE_MAP[tagControlIp] ?? "zone1";
  // 当前控制目标车的标签
  const controlLabel = ROBOTS.find((r) => r.ip === tagControlIp)?.label ?? tagControlIp;

  // 区域标签 — 只收集控制目标所属 zone 的标签
  const availableTags = new Set<string>();
  if (showZoneBar) {
    for (const z of zones) {
      if (!z.polygonJson) continue;
      const zoneNum = z.stationPattern?.match(/^(?:LM|AP|CP)(\d)/)?.[1];
      if (zoneNum === "1" && controlGroup !== "zone1") continue;
      if (zoneNum === "2" && controlGroup !== "zone2") continue;
      if (!zoneNum) {
        try {
          const p: number[][] = JSON.parse(z.polygonJson);
          if (p.length > 0 && (p[0][0] >= -5) !== (controlGroup === "zone2")) continue;
        } catch {}
      }
      if (!z.semanticTags) continue;
      try {
        const tags: string[] = JSON.parse(z.semanticTags);
        for (const t of tags) availableTags.add(t);
      } catch {}
    }
  }

  // 可选的控制目标车列表（全部车可切换）
  const controllableVehicles = ROBOTS;

  // 当前控制目标的 hidden set
  const controlHidden = hiddenTagsByIp[tagControlIp] ?? new Set<string>();
  const allTagsHidden =
    allTagOptions.length > 0 && allTagOptions.every((t) => controlHidden.has(t));

  return (
    <div className="absolute -top-6 right-4 z-[var(--z-overlay)] flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--app-color-surface-container)]/90 backdrop-blur border border-[var(--app-color-border-default)] shadow-md">
      {/* 路线开关 */}
      {showRouteBar && (
        <>
          <span className="text-[8px] text-[var(--app-color-text-tertiary)] shrink-0">
            路线
          </span>
          {ROUTE_TAGS.map((rt) => (
            <button
              key={rt.key}
              onClick={() => onToggleRouteType(rt.key)}
              className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium transition-colors ${
                hiddenRouteTypes.has(rt.key)
                  ? "opacity-30 bg-[var(--app-color-border-default)]"
                  : "text-white"
              }`}
              style={!hiddenRouteTypes.has(rt.key) ? { backgroundColor: rt.color } : {}}
              title={
                hiddenRouteTypes.has(rt.key)
                  ? `显示${rt.label}路线`
                  : `隐藏${rt.label}路线`
              }
            >
              {rt.label}
            </button>
          ))}
          <span className="w-px h-3 bg-[var(--app-color-border-default)]" />
        </>
      )}
      {/* AGV 快速显隐开关 */}
      {controllableVehicles.map((r) => {
        const hidden = hiddenAgvs.has(r.ip);
        return (
          <button
            key={`vis-${r.ip}`}
            onClick={() => onToggleAgvVisibility(r.ip)}
            className={`text-[9px] font-medium transition-opacity ${
              hidden ? "opacity-25" : "opacity-100"
            }`}
            style={{ color: r.color }}
            title={hidden ? `显示${r.label}` : `隐藏${r.label}`}
          >
            {hidden ? "○" : "●"} {r.label}
          </button>
        );
      })}
    </div>
  );
}
