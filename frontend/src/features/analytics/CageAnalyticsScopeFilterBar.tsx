import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import {
  fetchCageShelfFilterOptions,
  type CageShelfFilterOptions,
} from "@/api/domains/cageShelf.api";
import {
  formatCageFilterSummary,
  type CageAnalyticsDraftFilter,
  type CageFloorSel,
  type CageRoomSel,
} from "@/features/analytics/cageAnalyticsFilter";
import { cn } from "@/lib/utils";

type Props = {
  filters: CageAnalyticsDraftFilter;
  onChange: (next: CageAnalyticsDraftFilter) => void;
  onClear: () => void;
};

type OptionPools = {
  campuses: CageShelfFilterOptions["campuses"];
  areas: Array<{ campusId: string; areaId: string; areaName: string }>;
  floors: Array<CageFloorSel>;
  rooms: Array<CageRoomSel>;
};

function areaKey(a: { areaId: string; areaName: string }) {
  return `${a.areaId}\0${a.areaName}`;
}

function floorKey(f: { floorId: string; floorName: string }) {
  return `${f.floorId}\0${f.floorName}`;
}

function roomKey(r: { roomId: string; roomName: string }) {
  return `${r.roomId}\0${r.roomName}`;
}

function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition",
        active
          ? "border-blue-500 bg-blue-50 text-blue-900"
          : "border-neutral-200 bg-white text-neutral-600 hover:border-blue-200"
      )}
    >
      {label}
    </button>
  );
}

function LevelGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="text-[10px] font-medium text-neutral-400">{title}</span>
      {children}
    </div>
  );
}

async function loadOptionPools(filters: CageAnalyticsDraftFilter): Promise<OptionPools> {
  const base = await fetchCageShelfFilterOptions({});
  const campuses = base.campuses ?? [];

  if (filters.campuses.length === 0) {
    return { campuses, areas: [], floors: [], rooms: [] };
  }

  const campusIds = filters.campuses.map((c) => c.campusId);

  const areaMap = new Map<string, { campusId: string; areaId: string; areaName: string }>();
  for (const campusId of campusIds) {
    const data = await fetchCageShelfFilterOptions({ campusId: Number(campusId) });
    for (const a of data.areas ?? []) {
      areaMap.set(`${campusId}\0${areaKey(a)}`, {
        campusId,
        areaId: a.areaId,
        areaName: a.areaName,
      });
    }
  }
  const areas = [...areaMap.values()];

  const areaTargets =
    filters.areas.length > 0
      ? filters.areas
      : areas.map((a) => ({ campusId: a.campusId, areaId: a.areaId, areaName: a.areaName }));

  const floorMap = new Map<string, CageFloorSel>();
  for (const campusId of campusIds) {
    const scopedAreas = areaTargets.filter((a) => a.campusId === campusId);
    const areaList = scopedAreas.length > 0 ? scopedAreas : [{ campusId, areaId: "", areaName: "" }];
    for (const a of areaList) {
      const data = await fetchCageShelfFilterOptions({
        campusId: Number(campusId),
        areaId: a.areaId || undefined,
        areaName: a.areaName || undefined,
      });
      for (const f of data.floors ?? []) {
        const sel: CageFloorSel = {
          campusId,
          areaId: a.areaId,
          areaName: a.areaName,
          floorId: f.floorId,
          floorName: f.floorName,
        };
        floorMap.set(`${campusId}\0${areaKey(a)}\0${floorKey(f)}`, sel);
      }
    }
  }
  const floors = [...floorMap.values()];

  const floorTargets =
    filters.floors.length > 0
      ? filters.floors
      : floors;

  const roomMap = new Map<string, CageRoomSel>();
  for (const fl of floorTargets) {
    const data = await fetchCageShelfFilterOptions({
      campusId: Number(fl.campusId),
      areaId: fl.areaId || undefined,
      areaName: fl.areaName || undefined,
      floorId: fl.floorId,
      floorName: fl.floorName,
    });
    for (const r of data.rooms ?? []) {
      const sel: CageRoomSel = {
        campusId: fl.campusId,
        areaId: fl.areaId,
        areaName: fl.areaName,
        floorId: fl.floorId,
        floorName: fl.floorName,
        roomId: r.roomId,
        roomName: r.roomName,
      };
      roomMap.set(`${fl.campusId}\0${floorKey(fl)}\0${roomKey(r)}`, sel);
    }
  }

  return { campuses, areas, floors, rooms: [...roomMap.values()] };
}

export function CageAnalyticsScopeFilterBar({ filters, onChange, onClear }: Props) {
  const [pools, setPools] = useState<OptionPools>({
    campuses: [],
    areas: [],
    floors: [],
    rooms: [],
  });
  const [loading, setLoading] = useState(false);

  const summary = useMemo(() => formatCageFilterSummary(filters), [filters]);

  const refreshPools = useCallback(async () => {
    setLoading(true);
    try {
      setPools(await loadOptionPools(filters));
    } catch {
      setPools({ campuses: [], areas: [], floors: [], rooms: [] });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void refreshPools();
  }, [refreshPools]);

  const campusKeys = useMemo(() => new Set(filters.campuses.map((c) => c.campusId)), [filters.campuses]);
  const areaKeys = useMemo(() => new Set(filters.areas.map((a) => `${a.campusId}\0${areaKey(a)}`)), [filters.areas]);
  const floorKeys = useMemo(
    () => new Set(filters.floors.map((f) => `${f.campusId}\0${areaKey(f)}\0${floorKey(f)}`)),
    [filters.floors]
  );
  const roomKeys = useMemo(
    () => new Set(filters.rooms.map((r) => `${r.campusId}\0${floorKey(r)}\0${roomKey(r)}`)),
    [filters.rooms]
  );

  const toggleCampus = (c: { campusId: string; campusName: string }) => {
    const id = String(c.campusId);
    const exists = campusKeys.has(id);
    const campuses = exists
      ? filters.campuses.filter((x) => x.campusId !== id)
      : [...filters.campuses, { campusId: id, campusName: c.campusName }];
    const campusSet = new Set(campuses.map((x) => x.campusId));
    onChange({
      ...filters,
      campuses,
      areas: filters.areas.filter((a) => campusSet.has(a.campusId)),
      floors: filters.floors.filter((f) => campusSet.has(f.campusId)),
      rooms: filters.rooms.filter((r) => campusSet.has(r.campusId)),
    });
  };

  const toggleArea = (a: { campusId: string; areaId: string; areaName: string }) => {
    const key = `${a.campusId}\0${areaKey(a)}`;
    const exists = areaKeys.has(key);
    const areas = exists
      ? filters.areas.filter((x) => `${x.campusId}\0${areaKey(x)}` !== key)
      : [...filters.areas, { campusId: a.campusId, areaId: a.areaId, areaName: a.areaName }];
    const areaKeySet = new Set(areas.map((x) => `${x.campusId}\0${areaKey(x)}`));
    onChange({
      ...filters,
      areas,
      floors: filters.floors.filter((f) => areaKeySet.has(`${f.campusId}\0${areaKey(f)}`)),
      rooms: filters.rooms.filter((r) => areaKeySet.has(`${r.campusId}\0${areaKey(r)}`)),
    });
  };

  const toggleFloor = (f: CageFloorSel) => {
    const key = `${f.campusId}\0${areaKey(f)}\0${floorKey(f)}`;
    const exists = floorKeys.has(key);
    const floors = exists
      ? filters.floors.filter((x) => `${x.campusId}\0${areaKey(x)}\0${floorKey(x)}` !== key)
      : [...filters.floors, f];
    const floorKeySet = new Set(floors.map((x) => `${x.campusId}\0${areaKey(x)}\0${floorKey(x)}`));
    onChange({
      ...filters,
      floors,
      rooms: filters.rooms.filter((r) => floorKeySet.has(`${r.campusId}\0${areaKey(r)}\0${floorKey(r)}`)),
    });
  };

  const toggleRoom = (r: CageRoomSel) => {
    const key = `${r.campusId}\0${floorKey(r)}\0${roomKey(r)}`;
    const exists = roomKeys.has(key);
    const rooms = exists
      ? filters.rooms.filter((x) => `${x.campusId}\0${floorKey(x)}\0${roomKey(x)}` !== key)
      : [...filters.rooms, r];
    onChange({ ...filters, rooms });
  };

  const showAreas = filters.campuses.length > 0 && pools.areas.length > 0;
  const showFloors = filters.campuses.length > 0 && pools.floors.length > 0;
  const showRooms = filters.campuses.length > 0 && pools.rooms.length > 0;

  return (
    <div
      data-analytics-scope-filters
      className="flex flex-nowrap items-center gap-1.5 overflow-x-auto rounded-xl border border-neutral-200/90 bg-white px-3 py-2 shadow-sm [scrollbar-width:thin]"
      title={summary || "点击标签多选；不选表示该级不限"}
    >
      <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden />

      {loading && pools.campuses.length === 0 ? (
        <span className="text-[10px] text-neutral-400">加载筛选项…</span>
      ) : pools.campuses.length === 0 ? (
        <span className="text-[10px] text-neutral-400">暂无索引，请先导入 CSV</span>
      ) : (
        <>
          <LevelGroup title="校区">
            {pools.campuses.map((c) => (
              <ToggleChip
                key={c.campusId}
                label={c.campusName}
                active={campusKeys.has(String(c.campusId))}
                onClick={() => toggleCampus({ campusId: String(c.campusId), campusName: c.campusName })}
              />
            ))}
          </LevelGroup>

          {showAreas ? (
            <>
              <span className="shrink-0 text-neutral-200">|</span>
              <LevelGroup title="区域">
                {pools.areas.map((a) => (
                  <ToggleChip
                    key={`${a.campusId}-${a.areaId}-${a.areaName}`}
                    label={a.areaName}
                    active={areaKeys.has(`${a.campusId}\0${areaKey(a)}`)}
                    onClick={() => toggleArea(a)}
                  />
                ))}
              </LevelGroup>
            </>
          ) : null}

          {showFloors ? (
            <>
              <span className="shrink-0 text-neutral-200">|</span>
              <LevelGroup title="楼层">
                {pools.floors.map((f) => (
                  <ToggleChip
                    key={`${f.campusId}-${f.areaId}-${f.floorId}-${f.floorName}`}
                    label={f.floorName}
                    active={floorKeys.has(`${f.campusId}\0${areaKey(f)}\0${floorKey(f)}`)}
                    onClick={() => toggleFloor(f)}
                  />
                ))}
              </LevelGroup>
            </>
          ) : null}

          {showRooms ? (
            <>
              <span className="shrink-0 text-neutral-200">|</span>
              <LevelGroup title="房间">
                {pools.rooms.map((r) => (
                  <ToggleChip
                    key={`${r.roomId}-${r.roomName}`}
                    label={r.roomName}
                    active={roomKeys.has(`${r.campusId}\0${floorKey(r)}\0${roomKey(r)}`)}
                    onClick={() => toggleRoom(r)}
                  />
                ))}
              </LevelGroup>
            </>
          ) : null}
        </>
      )}

      {summary ? (
        <>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-neutral-200" />
          <span
            className="min-w-0 max-w-[min(24rem,36vw)] shrink truncate text-[10px] font-medium text-blue-800"
            title={summary}
          >
            已选 {summary}
          </span>
        </>
      ) : null}

      <button
        type="button"
        onClick={onClear}
        className="ml-auto shrink-0 text-[10px] font-semibold text-neutral-400 hover:text-rose-500"
      >
        清除
      </button>
    </div>
  );
}
