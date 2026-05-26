import {
  COMPARE_CYCLE_OPTIONS,
  type AnalyticsCompareCycle,
} from "@/features/analytics/analyticsPipelineFilter";

export type CageCampusSel = { campusId: string; campusName: string };
export type CageAreaSel = { campusId: string; areaId: string; areaName: string };
export type CageFloorSel = {
  campusId: string;
  areaId: string;
  areaName: string;
  floorId: string;
  floorName: string;
};
export type CageRoomSel = {
  campusId: string;
  areaId: string;
  areaName: string;
  floorId: string;
  floorName: string;
  roomId: string;
  roomName: string;
};

/** 与笼架信息页一致：校区 → 区域 → 楼层 → 房间（各级支持多选） */
export type CageAnalyticsScopeFilter = {
  campuses: CageCampusSel[];
  areas: CageAreaSel[];
  floors: CageFloorSel[];
  rooms: CageRoomSel[];
  compareCycles: AnalyticsCompareCycle[];
};

export type CageAnalyticsDraftFilter = CageAnalyticsScopeFilter;

export { COMPARE_CYCLE_OPTIONS };

export const defaultCageAnalyticsDraftFilter = (): CageAnalyticsDraftFilter => ({
  campuses: [],
  areas: [],
  floors: [],
  rooms: [],
  compareCycles: ["day"],
});

export function cageScopeFilterOnly(filter: CageAnalyticsDraftFilter): Record<string, unknown> {
  const out: Record<string, unknown> = {
    compareCycles: filter.compareCycles.length ? filter.compareCycles : ["day"],
  };
  if (filter.campuses.length) {
    out.campusIds = filter.campuses.map((c) => c.campusId);
    out.campusNames = filter.campuses.map((c) => c.campusName);
  }
  if (filter.areas.length) {
    out.areaIds = filter.areas.map((a) => a.areaId);
    out.areaNames = filter.areas.map((a) => a.areaName);
    out.areaCampusIds = filter.areas.map((a) => a.campusId);
  }
  if (filter.floors.length) {
    out.floorIds = filter.floors.map((f) => f.floorId);
    out.floorNames = filter.floors.map((f) => f.floorName);
    out.floorAreaIds = filter.floors.map((f) => f.areaId);
    out.floorCampusIds = filter.floors.map((f) => f.campusId);
  }
  if (filter.rooms.length) {
    out.roomIds = filter.rooms.map((r) => r.roomId);
    out.roomNames = filter.rooms.map((r) => r.roomName);
    out.roomFloorIds = filter.rooms.map((r) => r.floorId);
    out.roomAreaIds = filter.rooms.map((r) => r.areaId);
    out.roomCampusIds = filter.rooms.map((r) => r.campusId);
  }
  return out;
}

export function migrateCageAnalyticsFilter(raw: Record<string, unknown>): CageAnalyticsDraftFilter {
  const base = defaultCageAnalyticsDraftFilter();

  const fromCompare = parseStringArray(raw.compareCycles);
  const fromAudit = parseStringArray(raw.auditCycles);
  const compareCycles = [...fromCompare, ...fromAudit].filter(
    (c): c is AnalyticsCompareCycle => c === "day" || c === "week" || c === "month"
  );
  const uniqueCycles = [...new Set(compareCycles)];

  const campuses = parseCampuses(raw);
  const areas = parseAreas(raw, campuses);
  const floors = parseFloors(raw, areas);
  const rooms = parseRooms(raw, floors);

  return {
    campuses,
    areas,
    floors,
    rooms,
    compareCycles: uniqueCycles.length ? uniqueCycles : base.compareCycles,
  };
}

export function formatCageFilterSummary(f: CageAnalyticsDraftFilter): string {
  const parts: string[] = [];
  if (f.campuses.length) {
    parts.push(f.campuses.map((c) => c.campusName).join("、"));
  }
  if (f.areas.length) {
    parts.push(f.areas.map((a) => a.areaName).join("、"));
  }
  if (f.floors.length) {
    parts.push(f.floors.map((x) => x.floorName).join("、"));
  }
  if (f.rooms.length) {
    parts.push(f.rooms.map((r) => r.roomName).join("、"));
  }
  return parts.join(" / ");
}

function parseCampuses(raw: Record<string, unknown>): CageCampusSel[] {
  const ids = parseStringArray(raw.campusIds);
  const names = parseStringArray(raw.campusNames);
  if (ids.length) {
    return ids.map((campusId, i) => ({
      campusId,
      campusName: names[i] ?? campusId,
    }));
  }
  const legacyId = String(raw.campusId ?? "").trim();
  const legacyName = String(raw.campusName ?? "").trim();
  if (legacyId) {
    return [{ campusId: legacyId, campusName: legacyName || legacyId }];
  }
  return [];
}

function parseAreas(raw: Record<string, unknown>, campuses: CageCampusSel[]): CageAreaSel[] {
  const ids = parseStringArray(raw.areaIds);
  const names = parseStringArray(raw.areaNames);
  const campusIds = parseStringArray(raw.areaCampusIds);
  if (ids.length) {
    return ids.map((areaId, i) => ({
      campusId: campusIds[i] ?? campuses[0]?.campusId ?? "",
      areaId,
      areaName: names[i] ?? areaId,
    }));
  }
  const legacyId = String(raw.areaId ?? "").trim();
  const legacyName = String(raw.areaName ?? "").trim();
  if (legacyId) {
    return [
      {
        campusId: campuses[0]?.campusId ?? String(raw.campusId ?? "").trim(),
        areaId: legacyId,
        areaName: legacyName || legacyId,
      },
    ];
  }
  return [];
}

function parseFloors(raw: Record<string, unknown>, areas: CageAreaSel[]): CageFloorSel[] {
  const ids = parseStringArray(raw.floorIds);
  const names = parseStringArray(raw.floorNames);
  const areaIds = parseStringArray(raw.floorAreaIds);
  const campusIds = parseStringArray(raw.floorCampusIds);
  if (ids.length) {
    return ids.map((floorId, i) => {
      const area = areas.find((a) => a.areaId === (areaIds[i] ?? "")) ?? areas[0];
      return {
        campusId: campusIds[i] ?? area?.campusId ?? "",
        areaId: areaIds[i] ?? area?.areaId ?? "",
        areaName: area?.areaName ?? "",
        floorId,
        floorName: names[i] ?? floorId,
      };
    });
  }
  const legacyId = String(raw.floorId ?? "").trim();
  const legacyName = String(raw.floorName ?? "").trim();
  if (legacyId) {
    const area = areas[0];
    return [
      {
        campusId: area?.campusId ?? String(raw.campusId ?? "").trim(),
        areaId: area?.areaId ?? String(raw.areaId ?? "").trim(),
        areaName: area?.areaName ?? "",
        floorId: legacyId,
        floorName: legacyName || legacyId,
      },
    ];
  }
  return [];
}

function parseRooms(raw: Record<string, unknown>, floors: CageFloorSel[]): CageRoomSel[] {
  const ids = parseStringArray(raw.roomIds);
  const names = parseStringArray(raw.roomNames);
  const floorIds = parseStringArray(raw.roomFloorIds);
  if (ids.length) {
    return ids.map((roomId, i) => {
      const floor = floors.find((f) => f.floorId === (floorIds[i] ?? "")) ?? floors[0];
      return {
        campusId: floor?.campusId ?? "",
        areaId: floor?.areaId ?? "",
        areaName: floor?.areaName ?? "",
        floorId: floorIds[i] ?? floor?.floorId ?? "",
        floorName: floor?.floorName ?? "",
        roomId,
        roomName: names[i] ?? roomId,
      };
    });
  }
  const legacyId = String(raw.roomId ?? "").trim();
  const legacyName = String(raw.roomName ?? "").trim();
  if (legacyId) {
    const floor = floors[0];
    return [
      {
        campusId: floor?.campusId ?? String(raw.campusId ?? "").trim(),
        areaId: floor?.areaId ?? String(raw.areaId ?? "").trim(),
        areaName: floor?.areaName ?? "",
        floorId: floor?.floorId ?? String(raw.floorId ?? "").trim(),
        floorName: floor?.floorName ?? "",
        roomId: legacyId,
        roomName: legacyName || legacyId,
      },
    ];
  }
  return [];
}

function parseStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string" && v.includes(",")) return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}
