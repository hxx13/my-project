import { useState, useMemo, useRef } from "react";
import { type QueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  type AgvSpatialElement,
} from "@/api/domains/agv-analysis.api";
import { AGV_ZONE_MAP, resolveZoneGroup } from "@/features/agv-tracker/zoneGrouping";
import { makeRectPolygon } from "@/features/agv-tracker/AgvZonePanel";
import { type CustomTag } from "@/features/agv-tracker/tagConfig";

const ROBOTS = [
  { ip: "172.22.159.16", label: "AGV-1", color: "#3b82f6" },
  { ip: "172.22.159.18", label: "AGV-2", color: "#22c55e" },
  { ip: "172.22.159.20", label: "AGV-3", color: "#f59e0b" },
  { ip: "172.22.159.22", label: "AGV-4", color: "#8b5cf6" },
];

type PendingPick =
  | { x: number; y: number }
  | { x1: number; y1: number; x2: number; y2: number }
  | null;

export function useAgvZoneManagement(
  zones: AgvSpatialElement[],
  hiddenTagsByIp: Record<string, Set<string>>,
  tagControlIp: string,
  allTagColors: Record<string, string>,
  qc: QueryClient,
  pushUndo: (label: string, undo: () => void) => void,
  saveZoneMut: UseMutationResult<any, Error, Partial<AgvSpatialElement>, unknown>,
  deleteZoneMut: UseMutationResult<any, Error, number, unknown>,
  pendingPick: PendingPick,
  setPendingPick: (v: PendingPick) => void,
  customTags: CustomTag[],
) {
  const [zonePopover, setZonePopover] = useState<{
    id: number;
    name: string;
    stationPattern?: string;
    color?: string;
  } | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  // pick 来源 panel——哪个面板触发的 pick，zone 就归属哪个 group
  const pickZoneRef = useRef<string>("zone1");

  const handleQuickSaveZone = (tag: string) => {
    if (!pendingPick) return;
    const isRect = "x1" in pendingPick;
    const color = allTagColors[tag] || "#3b82f6";
    const polygonJson = isRect
      ? makeRectPolygon(pendingPick.x1, pendingPick.y1, pendingPick.x2, pendingPick.y2)
      : JSON.stringify([
          [pendingPick.x - 0.8, pendingPick.y + 0.8],
          [pendingPick.x + 0.8, pendingPick.y + 0.8],
          [pendingPick.x + 0.8, pendingPick.y - 0.8],
          [pendingPick.x - 0.8, pendingPick.y - 0.8],
        ]);
    // 标签 scope 决定坐标归属：world → 世界坐标系，agv → 绑定该车局部坐标系
    const tagDef = customTags.find(t => t.name === tag);
    const robotIp = tagDef?.scope === "agv" ? tagDef.agvIp : undefined;
    // 归属触发 pick 的 panel——左边画归左边，右边画归右边
    const group = pickZoneRef.current;
    const element: AgvSpatialElement = {
      name: `${tag}标记`,
      elementType: "POLYGON_ZONE",
      polygonJson,
      semanticTags: JSON.stringify([tag]),
      mapName: "",
      stationPattern: `__${group}__`,
      color,
      source: isRect ? "MANUAL_RECT" : "MANUAL",
      robotIp,
    };
    saveZoneMut.mutate(element, { onSuccess: () => setPendingPick(null) });
  };

  const handleZoneClick = (zoneId: number, labelName: string, stationPattern?: string) => {
    const displayName = stationPattern ? `${stationPattern} · ${labelName}` : labelName;
    const zoneColor = zones.find((z) => z.id === zoneId)?.color;
    setZonePopover({ id: zoneId, name: displayName, stationPattern, color: zoneColor });
    setSelectedZoneId(zoneId);
  };

  const handleDeleteZone = () => {
    if (!zonePopover) return;
    const deletedZone = zones.find((z) => z.id === zonePopover.id);
    if (deletedZone) {
      pushUndo(`删除「${deletedZone.name}」`, () => {
        saveZoneMut.mutate(deletedZone as AgvSpatialElement);
      });
    }
    deleteZoneMut.mutate(zonePopover.id);
    setZonePopover(null);
    setSelectedZoneId(null);
  };

  const handleZoneColorChange = (color: string) => {
    if (!zonePopover) return;
    const oldColor = zonePopover.color;
    if (oldColor && oldColor !== color) {
      pushUndo("更改颜色", () => {
        qc.setQueryData<AgvSpatialElement[]>(["agvSpatialElements"], (old) =>
          old?.map((z) => (z.id === zonePopover.id ? { ...z, color: oldColor } : z)),
        );
        saveZoneMut.mutate({ id: zonePopover.id, color: oldColor } as AgvSpatialElement);
      });
    }
    qc.setQueryData<AgvSpatialElement[]>(["agvSpatialElements"], (old) =>
      old?.map((z) => (z.id === zonePopover.id ? { ...z, color } : z)),
    );
    saveZoneMut.mutate({ id: zonePopover.id, color } as AgvSpatialElement);
    setZonePopover((prev) => (prev ? { ...prev, color } : null));
  };

  const handleZoneReshape = (id: number, polygonJson: string) => {
    const oldJson = zones.find((z) => z.id === id)?.polygonJson;
    if (oldJson && oldJson !== polygonJson) {
      pushUndo("移动/调整区域", () => {
        qc.setQueryData<AgvSpatialElement[]>(["agvSpatialElements"], (old) =>
          old?.map((z) => (z.id === id ? { ...z, polygonJson: oldJson } : z)),
        );
        saveZoneMut.mutate({ id, polygonJson: oldJson } as AgvSpatialElement);
      });
    }
    qc.setQueryData<AgvSpatialElement[]>(["agvSpatialElements"], (old) =>
      old?.map((z) => (z.id === id ? { ...z, polygonJson } : z)),
    );
    saveZoneMut.mutate({ id, polygonJson } as AgvSpatialElement);
  };

  // Zone overlays — 双象限按区域隔离（AGV-1+2 只看 zone1，AGV-3+4 只看 zone2）
  const pairZoneOverlays = useMemo(() => {
    const allZones = zones
      .filter(
        (z) =>
          z.polygonJson &&
          (z.elementType === "POLYGON_ZONE" || z.elementType === "STATION_ZONE"),
      )
      .filter(
        (z) =>
          z.source === "BEHAVIOR" ||
          z.source === "MANUAL" ||
          z.source === "MANUAL_RECT" ||
          z.source === "TOPOLOGY" ||
          (z.source === "AUTO" && (z.hitCount ?? 0) > 0),
      )
      .map((z) => {
        let cx = 0;
        let cy = 0;
        try {
          const p: number[][] = JSON.parse(z.polygonJson!);
          for (const v of p) {
            cx += v[0];
            cy += v[1];
          }
          cx /= p.length;
          cy /= p.length;
        } catch {
          /* ignore */
        }
        const group = resolveZoneGroup(z.polygonJson!, z.stationPattern);
        return {
          id: z.id!,
          polygonJson: z.polygonJson!,
          color: z.color || "#3b82f6",
          name: z.name,
          stationPattern: z.stationPattern ?? undefined,
          cx,
          cy,
          group,
          robotIp: z.robotIp ?? undefined,
          semanticTags: z.semanticTags ?? "[]",
          source: z.source ?? "AUTO",
        };
      });
    const pairs = [
      [ROBOTS[0], ROBOTS[1]],
      [ROBOTS[2], ROBOTS[3]],
    ];
    return pairs.map(([a, b]) => {
      const pairGroup = AGV_ZONE_MAP[a.ip];
      const pairIps = new Set([a.ip, b.ip]);
      const hiddenA = hiddenTagsByIp[a.ip] || new Set<string>();
      const hiddenB = hiddenTagsByIp[b.ip] || new Set<string>();
      // 两台车的隐标签并集 — 用于无归属的 world zone
      const hiddenMerged = new Set([...hiddenA, ...hiddenB]);
      return allZones.filter((z) => {
        if (z.group !== pairGroup) return false;
        if (z.robotIp && !pairIps.has(z.robotIp)) return false;
        // 归属某台车的 zone → 只用该车的隐藏集
        if (z.robotIp) {
          const perAgv = hiddenTagsByIp[z.robotIp];
          if (!perAgv || perAgv.size === 0) return true;
          try {
            const tags: string[] = JSON.parse(z.semanticTags || "[]");
            return !tags.some((t) => perAgv.has(t));
          } catch { return true; }
        }
        // World zone（无归属）→ 两台车都隐藏时才隐藏
        if (hiddenMerged.size === 0) return true;
        try {
          const tags: string[] = JSON.parse(z.semanticTags || "[]");
          return !tags.every((t) => hiddenMerged.has(t));
        } catch { return true; }
      });
    });
  }, [zones, hiddenTagsByIp, tagControlIp]);

  // 全量 zone（无裁剪，供单象限基础渲染）
  const canvasZoneOverlays = useMemo(() => {
    return zones
      .filter(
        (z) =>
          z.polygonJson &&
          (z.elementType === "POLYGON_ZONE" || z.elementType === "STATION_ZONE"),
      )
      .filter(
        (z) =>
          z.source === "BEHAVIOR" ||
          z.source === "MANUAL" ||
          z.source === "MANUAL_RECT" ||
          z.source === "TOPOLOGY" ||
          (z.source === "AUTO" && (z.hitCount ?? 0) > 0),
      )
      .map((z) => ({
        id: z.id!,
        polygonJson: z.polygonJson!,
        color: z.color || "#3b82f6",
        name: z.name,
        stationPattern: z.stationPattern ?? undefined,
        group: resolveZoneGroup(z.polygonJson!, z.stationPattern),
        robotIp: z.robotIp ?? undefined,
        semanticTags: z.semanticTags ?? "[]",
        source: z.source ?? "AUTO",
      }));
  }, [zones]);

  // 单象限：每台 AGV 只看自己区域的 zone + 自己独立的标签显隐
  const robotZoneOverlays = useMemo(() => {
    const result: Record<string, typeof canvasZoneOverlays> = {};
    for (const r of ROBOTS) {
      const agvGroup = AGV_ZONE_MAP[r.ip];
      const hidden = hiddenTagsByIp[r.ip] || new Set<string>();
      result[r.ip] = canvasZoneOverlays.filter((z) => {
        if (z.group !== agvGroup) return false;
        if (z.robotIp && z.robotIp !== r.ip) return false;
        if (hidden.size === 0) return true;
        try {
          const tags: string[] = JSON.parse(z.semanticTags || "[]");
          return !tags.some((t) => hidden.has(t));
        } catch {
          return true;
        }
      });
    }
    return result;
  }, [canvasZoneOverlays, hiddenTagsByIp]);

  return {
    zonePopover,
    setZonePopover,
    selectedZoneId,
    setSelectedZoneId,
    handleQuickSaveZone,
    handleZoneClick,
    handleDeleteZone,
    handleZoneColorChange,
    handleZoneReshape,
    pairZoneOverlays,
    canvasZoneOverlays,
    robotZoneOverlays,
    pickZoneRef,
  };
}
