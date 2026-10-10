import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { fetchAgvCurrent, fetchAgvRecent, fetchCoordConfigs } from "@/api/domains/agv.api";
import {
  useSpatialElements,
  useRouteTopology,
  buildTopologyOverlays,
  useDeleteSpatialElement,
  useSaveSpatialElement,
  type AgvSpatialElement,
} from "@/api/domains/agv-analysis.api";
import { useAgvTrailRef } from "@/features/agv-tracker/useAgvTrailRef";
import { useTrailSeed } from "@/features/agv-tracker/useTrailSeed";
import { AGV_ROBOTS } from "@/features/agv-tracker/agvRobotConfig";
import { useAgvTagManagement } from "@/features/agv-tracker/useAgvTagManagement";
import { useAgvPickMode } from "@/features/agv-tracker/useAgvPickMode";
import { useAgvUndo } from "@/features/agv-tracker/useAgvUndo";
import { useAgvZoneManagement } from "@/features/agv-tracker/useAgvZoneManagement";
import { useAgvDataRefresh } from "@/features/agv-tracker/useAgvDataRefresh";
import { buildAgvInfo, type AgvInfo } from "@/features/agv-tracker/buildAgvInfo";
import AgvQuadrant from "@/features/agv-tracker/AgvQuadrant";
import AgvDualQuadrant from "@/features/agv-tracker/AgvDualQuadrant";
import { cn } from "@/lib/utils";

const ROBOTS = AGV_ROBOTS;

/**
 * 驾驶舱里的 AGV 实况地图。
 *
 * <h3>口径：与小车台**同一份配置、同一套推导**，不在这里重写任何一条规则</h3>
 * 区域叠加用的是小车台那个 `useAgvZoneManagement` 钩子算出来的 `pairZoneOverlays`（含它的
 * 「按标签隐藏」口径），路径叠加用的是同一套 `buildTopologyOverlays` + `hiddenRouteTypes` 过滤，
 * 分区划分用它的 `zoneIndices`（zone1 = AGV-1/2/5/6、zone2 = AGV-3/4），
 * 车辆图标读它的同一个本地配置键 `agvVehicleIcon`。
 * 也就是说小车台那边改了配置口径，这里自动跟着变 —— 不会出现两处画得不一样。
 *
 * <h3>搬到驾驶舱的与没搬的</h3>
 * 搬过来的都是**显示配置**：分区与单台聚焦切换、区域/路由两个显示开关。
 * 小车台那条「显示配置条」（标签/路线类型/车可见性）**没有搬**：它是 `-top-6` 悬浮条，
 * 会压住驾驶舱上一行的顶栏指标栏底边。
 * **没搬编辑类**：侧栏的坐标预设、区域绘制与改写、拓扑生成、标签增删改 —— 按约定这里只负责看地图与拖拽。
 */
export function CockpitAgvMap() {
  // ── 显示状态：默认值与小车台逐一相同 ──
  const [focusedAgvIp, setFocusedAgvIp] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<"zone1" | "zone2">("zone1");
  const [tagControlIp, setTagControlIp] = useState(ROBOTS[0].ip);
  const [showZones, setShowZones] = useState(true);
  // 路由默认**关**：与小车台一致。开着路由时画布只画拓扑路线（灰色为主，按站点类型着色），
  // 而各车本色走过的路径（轨迹）在路由模式下会被裁到最近 30 秒 —— 也就是说，
  // 「路线的颜色」要看得见，就得跟小车台一样默认关路由，需要看拓扑时再点开关。
  const [routeMode, setRouteMode] = useState(false);
  // 撤掉显示配置条后没有入口再改这两个集合了，恒为空 = 不过滤（画布入参约定仍要传）
  const [hiddenAgvs] = useState<Set<string>>(new Set());
  const [hiddenRouteTypes] = useState<Set<string>>(new Set());
  // 车辆图标是小车台持久化的配置，读同一个键 → 两边图标一致
  const [vehicleIcon] = useState<"arrow" | "forklift">(
    () => (localStorage.getItem("agvVehicleIcon") as "arrow" | "forklift") || "forklift",
  );

  // ── 数据层：与小车台调用同一批钩子、同样的参数 ──
  const coordConfigs = useQuery({ queryKey: ["agvCoordConfigs"], queryFn: fetchCoordConfigs, staleTime: 60_000 });
  const recentData = useQuery({
    queryKey: ["agvRecent"],
    queryFn: () => fetchAgvRecent(2),
    refetchInterval: 2_000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const currentData = useQuery({ queryKey: ["agvCurrent"], queryFn: fetchAgvCurrent, refetchInterval: 5_000, staleTime: 0 });
  const zones = useSpatialElements();
  const routeTopology = useRouteTopology();

  const { append, seed, getTrail, clearAll } = useAgvTrailRef();
  // 进页面补齐历史轨迹（与小车台同一个钩子）：否则只能靠 2 秒实时窗口攒点，
  // 采集一断画布上就只剩拓扑路线，看不到各车本色走过的路径
  useTrailSeed(seed, getTrail);
  const { robotAnalytics, dwellByIp, getStatus, getLastPolled } = useAgvDataRefresh(
    recentData.data, recentData.dataUpdatedAt, currentData.data, append, seed, getTrail, clearAll,
  );

  // ── 与小车台同一套区域/标签推导（不自己重写） ──
  const qc = useQueryClient();
  const { pushUndo } = useAgvUndo();
  const { hiddenTagsByIp, tags, allTagColors } = useAgvTagManagement(tagControlIp);
  const { pendingPick, setPendingPick } = useAgvPickMode();
  const saveZoneMut = useSaveSpatialElement();
  const deleteZoneMut = useDeleteSpatialElement();
  const { pairZoneOverlays } = useAgvZoneManagement(
    zones.data ?? [],
    hiddenTagsByIp,
    tagControlIp,
    allTagColors,
    qc,
    pushUndo,
    saveZoneMut as UseMutationResult<unknown, Error, Partial<AgvSpatialElement>, unknown>,
    deleteZoneMut,
    pendingPick,
    setPendingPick,
    tags,
  );

  // 聚焦哪台车，标签控制目标就跟到哪台（与小车台一致）
  useEffect(() => {
    if (focusedAgvIp !== null) setTagControlIp(focusedAgvIp);
    else setTagControlIp(ROBOTS[0].ip);
  }, [focusedAgvIp]);

  const routeOverlays = useMemo(() => {
    const all = buildTopologyOverlays(routeTopology.data);
    return hiddenRouteTypes.size === 0 ? all : all.filter((r) => !hiddenRouteTypes.has(r.routeType));
  }, [routeTopology.data, hiddenRouteTypes]);

  // 与小车台同样「每次渲染重建」—— buildAgvInfo 会把有效值写进 lastKnown 缓存，缓存要每次渲染更新
  const lastKnownRef = useRef<Record<string, Record<string, unknown>>>({});
  const infos: AgvInfo[] = ROBOTS.map((r) =>
    buildAgvInfo(r, getStatus, getLastPolled, robotAnalytics, dwellByIp, getTrail, coordConfigs.data, lastKnownRef),
  );

  // 分区划分与小车台逐字一致
  const zoneIndices = selectedZone === "zone1" ? [0, 1, 4, 5] : [2, 3];
  const qi = selectedZone === "zone1" ? 0 : 1;
  const pairInfos = zoneIndices.map((i) => infos[i]);
  const pairIps = new Set(zoneIndices.map((i) => ROBOTS[i].ip));
  const focused = focusedAgvIp ? infos.find((i) => i.ip === focusedAgvIp) ?? null : null;

  const tabBtn = (active: boolean) =>
    cn(
      "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
      active ? "bg-cyan-500/25 text-cyan-50 shadow-sm" : "text-slate-400 hover:text-slate-200",
    );
  const toggleBtn = (active: boolean) =>
    cn(
      "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
      active ? "bg-cyan-500/20 text-cyan-100" : "text-slate-500 hover:text-slate-300",
    );

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-lg border border-cyan-500/20 bg-slate-950/40">
      {/* 原来这里挂小车台那条「显示配置条」（标签 / 路线类型 / 车可见性）。
          它是 absolute -top-6 浮在地图容器上方，压住了上一行顶栏指标栏的底边（那一排运行指示灯），
          所以从驾驶舱里撤掉；小车台那边仍在用同一个组件。 */}

      {/* 视图切换：分区（小车台的 zoneIndices）+ 单台聚焦（小车台的 focusedAgvIp）+ 区域/路由显示开关 */}
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1.5 border-b border-cyan-500/15 px-1.5 py-1">
        <div className="inline-flex flex-wrap items-center gap-0.5 rounded-md bg-slate-900/70 p-0.5">
          {(["zone1", "zone2"] as const).map((z) => (
            <button
              key={z}
              type="button"
              title={`分区：${(z === "zone1" ? [0, 1, 4, 5] : [2, 3]).map((i) => ROBOTS[i].label).join(" / ")}`}
              onClick={() => {
                setSelectedZone(z);
                setFocusedAgvIp(null);
              }}
              className={tabBtn(selectedZone === z && !focused)}
            >
              {z === "zone1" ? "分区一" : "分区二"}
            </button>
          ))}
        </div>
        <span className="h-3.5 w-px shrink-0 bg-cyan-500/20" aria-hidden />
        <div className="inline-flex flex-wrap items-center gap-0.5 rounded-md bg-slate-900/70 p-0.5">
          <button type="button" onClick={() => setFocusedAgvIp(null)} className={tabBtn(focused === null)}>
            合并
          </button>
          {zoneIndices.map((i) => (
            <button
              key={ROBOTS[i].ip}
              type="button"
              onClick={() => setFocusedAgvIp(ROBOTS[i].ip)}
              className={tabBtn(focusedAgvIp === ROBOTS[i].ip)}
              style={focusedAgvIp === ROBOTS[i].ip ? { backgroundColor: ROBOTS[i].color, color: "#0f172a" } : undefined}
            >
              {ROBOTS[i].label}
            </button>
          ))}
        </div>
        <div className="ml-auto inline-flex items-center gap-1">
          <button type="button" onClick={() => setShowZones((v) => !v)} className={toggleBtn(showZones)}>
            区域
          </button>
          <button type="button" onClick={() => setRouteMode((v) => !v)} className={toggleBtn(routeMode)}>
            路由
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {focused ? (
          <AgvQuadrant
            ip={focused.ip}
            label={focused.label}
            online={focused.online}
            color={focused.color}
            trail={focused.trail}
            x={focused.x}
            y={focused.y}
            angle={focused.angle}
            speed={focused.speed}
            avgSpeed={focused.avgSpeed}
            maxSpeed={focused.maxSpeed}
            dwellSpots={focused.dwellSpots}
            battery={focused.battery}
            charging={focused.charging}
            taskStatus={focused.taskStatus}
            blocked={focused.blocked}
            emergency={focused.emergency}
            station={focused.station}
            mapName={focused.mapName}
            confidence={focused.confidence}
            relocStatus={focused.relocStatus}
            loadmapStatus={focused.loadmapStatus}
            odo={focused.odo}
            rssi={focused.rssi}
            driverEmc={focused.driverEmc}
            forkHeight={focused.forkHeight}
            forkInPlace={focused.forkInPlace}
            jackEnable={focused.jackEnable}
            jackState={focused.jackState}
            jackIsFull={focused.jackIsFull}
            jackMode={focused.jackMode}
            jackErrorCode={focused.jackErrorCode}
            errors={focused.errors}
            warnings={focused.warnings}
            diChannels={focused.diChannels}
            coordRotationDeg={focused.coordRotationDeg}
            coordOffsetX={focused.coordOffsetX}
            coordOffsetY={focused.coordOffsetY}
            coordScale={focused.coordScale}
            zoneOverlays={showZones ? pairZoneOverlays[qi].filter((z) => !z.robotIp || z.robotIp === focused.ip) : []}
            routeOverlays={routeMode ? routeOverlays.filter((ro) => ro.robotIp === focused.ip) : []}
            routeMode={routeMode}
            currentActivity={focused.currentActivity}
            vehicleIcon={vehicleIcon}
          />
        ) : (
          <AgvDualQuadrant
            agvs={pairInfos}
            zoneOverlays={showZones ? pairZoneOverlays[qi] : []}
            routeOverlays={routeMode ? routeOverlays.filter((ro) => pairIps.has(ro.robotIp)) : []}
            routeMode={routeMode}
            vehicleIcon={vehicleIcon}
            hiddenAgvs={hiddenAgvs}
          />
        )}
      </div>
    </div>
  );
}
