import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ANIMAL_ROOM_TELEMETRY_PAGE_QUERY_KEY,
  buildStructuredFloorTabs,
  DEFAULT_FACILITY_LAYOUT_RULES_V1,
  fetchFacilityLayoutRules,
  fetchWinccAnimalRoomTelemetry,
  formatTelemetryTs,
} from "@/api/telemetryApi";
import { buildSyntheticHvacStructTab } from "@/telemetry-view/animalTelemetryHvacUnits";
import { ANIMAL_ROOM_COCKPIT_RETURN_TO_KEY } from "@/features/admin/adminTelemetryNav";
import { SHSMU_LOGO_URL } from "@/constants/shsmuBranding";
import type { CockpitFloorBlock } from "./animalRoomCockpit/buildCockpitFloorBlocks";
import { buildCockpitFloorBlocks, COCKPIT_B1F_MERGED_TAB_KEY, mergeB1FPrefixedRoomsIntoSingleCockpitColumn } from "./animalRoomCockpit/buildCockpitFloorBlocks";
import { cockpitSplitMetricVerticalBarOption, computeCockpitPartitionUnifiedAxis, metricHasAnyDataIn } from "./animalRoomCockpit/cockpitChartOptions";
import { CockpitAutoResizeChart } from "./animalRoomCockpit/CockpitAutoResizeChart";
import { CockpitMachineRoomSidebar } from "./animalRoomCockpit/CockpitMachineRoomSidebar";
import { CockpitPowerStationMetrics } from "./animalRoomCockpit/CockpitPowerStationMetrics";
import {
  CockpitRobotArmMetricSlots,
  COCKPIT_COMPACT_METRIC_PILL_BASE,
  findRobotArmTagItems,
} from "./animalRoomCockpit/CockpitRobotArmMetricSlots";
import { CockpitTopBarFirstRow } from "./animalRoomCockpit/CockpitTopBarLayout";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Cpu, Factory, Forklift, Gauge, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const COCKPIT_HIDDEN_PARTITIONS_KEY = "animalRoomCockpit.hiddenPartitionTabKeys";
/** 旧版仅 B1F 开关，迁移一次后删除 */
const COCKPIT_SHOW_B1F_LEGACY_KEY = "animalRoomCockpit.showB1F";

const COCKPIT_SIDEBAR_DOCK_KEY = "animalRoomCockpit.sidebarDockV2";
/** 展开侧栏固定宽度（px），不可拖拽缩放 */
const COCKPIT_SIDEBAR_PANEL_PX = 200;

type CockpitSidebarDock = { leftOpen: boolean; rightOpen: boolean };

function readSidebarDockFromStorage(): CockpitSidebarDock {
  try {
    const raw = sessionStorage.getItem(COCKPIT_SIDEBAR_DOCK_KEY);
    if (raw) {
      const j = JSON.parse(raw) as { leftOpen?: unknown; rightOpen?: unknown };
      return {
        leftOpen: typeof j.leftOpen === "boolean" ? j.leftOpen : true,
        rightOpen: typeof j.rightOpen === "boolean" ? j.rightOpen : true,
      };
    }
  } catch {
    /* ignore */
  }
  return { leftOpen: true, rightOpen: true };
}

function saveSidebarDockToStorage(d: CockpitSidebarDock): void {
  try {
    sessionStorage.setItem(COCKPIT_SIDEBAR_DOCK_KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

function readHiddenPartitionTabKeysFromStorage(): Set<string> {
  try {
    let hidden = new Set<string>();
    const raw = sessionStorage.getItem(COCKPIT_HIDDEN_PARTITIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        for (const x of arr) {
          if (typeof x === "string" && x.length > 0) hidden.add(x);
        }
      }
    }
    if (sessionStorage.getItem(COCKPIT_SHOW_B1F_LEGACY_KEY) === "0") {
      hidden.add(COCKPIT_B1F_MERGED_TAB_KEY);
      sessionStorage.removeItem(COCKPIT_SHOW_B1F_LEGACY_KEY);
      sessionStorage.setItem(COCKPIT_HIDDEN_PARTITIONS_KEY, JSON.stringify([...hidden]));
    }
    return hidden;
  } catch {
    return new Set();
  }
}

function StatPlaceholder({
  icon: Icon,
  title,
  hint,
  variant = "card",
}: {
  icon: typeof Zap;
  title: string;
  hint?: string;
  variant?: "card" | "headerPill" | "metricsPill";
}) {
  if (variant === "headerPill") {
    return (
      <div
        className="pointer-events-auto shrink-0 rounded-md border border-cyan-500/20 bg-slate-950/80 px-2 py-1 shadow-sm backdrop-blur-sm"
        title={hint || title}
      >
        <div className="flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold text-cyan-100/95">
          <Icon className="h-3 w-3 shrink-0 text-cyan-400/75" aria-hidden />
          {title}
        </div>
      </div>
    );
  }
  if (variant === "metricsPill") {
    return (
      <div
        className={cn(
          COCKPIT_COMPACT_METRIC_PILL_BASE,
          "flex h-full min-h-0 min-w-0 shrink-0 flex-col justify-center sm:min-w-[9rem] sm:max-w-[11.5rem]"
        )}
        title={hint || title}
      >
        <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-cyan-100/95 sm:text-xs">
          <Icon className="h-3.5 w-3.5 shrink-0 text-cyan-400/80 sm:h-4 sm:w-4" aria-hidden />
          {title}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-950/50 px-2.5 py-2 text-left shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100/95">
        <Icon className="h-3.5 w-3.5 shrink-0 text-cyan-400/80" aria-hidden />
        {title}
      </div>
      {hint ? <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{hint}</p> : null}
    </div>
  );
}

type SplitMetric = "temp" | "hum" | "pressure";

/** 上 → 中 → 下：温度、湿度、压差；无数据的行仍占位，避免三行错位 */
const METRIC_ROWS: { metric: SplitMetric; title: string }[] = [
  { metric: "temp", title: "温度 (℃)" },
  { metric: "hum", title: "湿度 (%)" },
  { metric: "pressure", title: "压差 (Pa)" },
];

/** 将分区列内图表区「隐形」三等分：温度、湿度行严格同高，余数像素加在压差行，三行之和恒为 innerH */
function cockpitPartitionEqualThirdRowHeights(innerH: number): Record<SplitMetric, number> {
  const inner = Math.max(1, innerH);
  const base = Math.floor(inner / 3);
  const rem = inner - base * 3;
  return { temp: base, hum: base, pressure: base + rem };
}

function CockpitPartitionColumn({
  floor,
  stripRect,
  partitionCount,
}: {
  floor: CockpitFloorBlock;
  stripRect: { w: number; h: number };
  partitionCount: number;
}) {
  const gapPx = 6;
  const safeW = Math.max(1, stripRect.w);
  const safeH = Math.max(96, stripRect.h);
  const colW = Math.max(72, (safeW - gapPx * Math.max(0, partitionCount - 1)) / Math.max(1, partitionCount));

  const shellCls =
    "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-cyan-500/15 bg-slate-950/35 shadow-inner shadow-black/20";

  const hasAnyMetric = METRIC_ROWS.some(({ metric }) => metricHasAnyDataIn(floor.rooms, metric));

  if (!hasAnyMetric) {
    return (
      <div className={shellCls}>
        <div className="shrink-0 truncate px-1 pt-0.5 text-[10px] font-semibold text-cyan-100/85">{floor.title}</div>
        <div className="flex flex-1 items-center justify-center p-2 text-[10px] text-slate-500">无温湿压数据</div>
      </div>
    );
  }

  const titleBand = 11;
  const innerH = safeH - titleBand;
  const rowHeights = cockpitPartitionEqualThirdRowHeights(innerH);
  const rowH = (m: SplitMetric) => rowHeights[m];

  const unifiedAxis = useMemo(
    () => computeCockpitPartitionUnifiedAxis(floor.rooms, colW, rowHeights, METRIC_ROWS),
    [floor.rooms, colW, innerH, stripRect.h, stripRect.w, partitionCount]
  );

  return (
    <div className={shellCls}>
      <div className="shrink-0 truncate px-1 pt-0.5 text-[10px] font-semibold text-cyan-100/85">{floor.title}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
        {METRIC_ROWS.map((p, stackIdx) => {
          const has = metricHasAnyDataIn(floor.rooms, p.metric);
          const opt = has
            ? cockpitSplitMetricVerticalBarOption(
                floor.rooms,
                p.metric,
                { chartAreaHeight: rowH(p.metric), columnWidth: colW },
                p.title,
                {
                  cockpitStackRowIndex: stackIdx as 0 | 1 | 2,
                  ...(unifiedAxis ? { cockpitUnifiedXAxis: unifiedAxis } : {}),
                }
              )
            : null;
          return (
            <div
              key={`${floor.tabKey}-${p.metric}`}
              className="flex min-h-0 min-w-0 shrink-0 flex-col"
              style={{ height: rowH(p.metric), minHeight: rowH(p.metric) }}
            >
              {opt ? (
                <CockpitAutoResizeChart option={opt} className="min-h-0 h-full min-w-0 flex-1" style={{ height: "100%" }} />
              ) : (
                <div className="flex h-full min-h-0 flex-col items-center justify-center rounded border border-dashed border-slate-600/35 bg-slate-950/25 px-1 text-center">
                  <span className="text-[9px] font-medium text-slate-500">{p.title}</span>
                  <span className="text-[9px] text-slate-600">无数据</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AnimalRoomCockpitPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [gateTick, setGateTick] = useState(0);
  const [hiddenPartitionTabKeys, setHiddenPartitionTabKeys] = useState<Set<string>>(readHiddenPartitionTabKeysFromStorage);
  const [headerLogoFailed, setHeaderLogoFailed] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const powerStationMetricsRef = useRef<HTMLDivElement>(null);
  const [stripRect, setStripRect] = useState({ w: 800, h: 420 });
  const [metricsLaneAlignPx, setMetricsLaneAlignPx] = useState<number | null>(null);
  const [sidebarDock, setSidebarDock] = useState<CockpitSidebarDock>(() => readSidebarDockFromStorage());

  useEffect(() => {
    saveSidebarDockToStorage(sidebarDock);
  }, [sidebarDock]);

  useEffect(() => {
    try {
      sessionStorage.setItem(COCKPIT_HIDDEN_PARTITIONS_KEY, JSON.stringify([...hiddenPartitionTabKeys]));
    } catch {
      /* ignore */
    }
  }, [hiddenPartitionTabKeys]);

  const returnToPath = useMemo(() => {
    const st = (location.state as { returnTo?: string } | null)?.returnTo?.trim();
    if (st) return st;
    try {
      const s = sessionStorage.getItem(ANIMAL_ROOM_COCKPIT_RETURN_TO_KEY);
      return s?.trim() || null;
    } catch {
      return null;
    }
  }, [location.state, location.key]);

  const handleReturn = useCallback(() => {
    try {
      sessionStorage.removeItem(ANIMAL_ROOM_COCKPIT_RETURN_TO_KEY);
    } catch {
      /* ignore */
    }
    if (returnToPath) {
      navigate(returnToPath, { replace: true });
    } else {
      navigate(-1);
    }
  }, [navigate, returnToPath]);

  useEffect(() => {
    const id = window.setInterval(() => setGateTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const pageQ = useQuery({
    queryKey: ANIMAL_ROOM_TELEMETRY_PAGE_QUERY_KEY,
    queryFn: () => fetchWinccAnimalRoomTelemetry({ soloWidthPx: 960, hubClient: "web" }),
    staleTime: 8_000,
    placeholderData: (prev) => prev,
    retry: 1,
    refetchInterval: (query) => {
      void gateTick;
      const d = query.state.data;
      if (!d || d.winccEnabled === false) return false;
      const ms = d.pollIntervalMs;
      if (ms == null || ms <= 0) return false;
      const hasTabs = (d.tabs?.length ?? 0) > 0;
      const hasItems = (d.tagItems?.length ?? 0) > 0;
      if (!hasTabs && !hasItems) return false;
      return Math.max(5_000, ms);
    },
  });

  const facilityLayoutRulesQ = useQuery({
    queryKey: ["telemetry", "facilityLayoutRules"] as const,
    queryFn: fetchFacilityLayoutRules,
    staleTime: 300_000,
    retry: 1,
  });
  const facilityLayoutRules = facilityLayoutRulesQ.data ?? DEFAULT_FACILITY_LAYOUT_RULES_V1;

  const page = pageQ.data;

  const structTabs = useMemo(
    () => buildStructuredFloorTabs(page?.tagItems, facilityLayoutRules),
    [page?.tagItems, facilityLayoutRules]
  );

  const cockpitFloors = useMemo(
    () =>
      mergeB1FPrefixedRoomsIntoSingleCockpitColumn(buildCockpitFloorBlocks(structTabs, facilityLayoutRules)),
    [structTabs, facilityLayoutRules]
  );

  const cockpitMachineRoomTab = useMemo(
    () => buildSyntheticHvacStructTab(structTabs, facilityLayoutRules),
    [structTabs, facilityLayoutRules]
  );

  useEffect(() => {
    const valid = new Set(cockpitFloors.map((f) => f.tabKey));
    setHiddenPartitionTabKeys((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (valid.has(k)) next.add(k);
        else changed = true;
      }
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [cockpitFloors]);

  const cockpitVisibleFloors = useMemo(
    () => cockpitFloors.filter((f) => !hiddenPartitionTabKeys.has(f.tabKey)),
    [cockpitFloors, hiddenPartitionTabKeys]
  );

  const roomCount = useMemo(
    () => cockpitVisibleFloors.reduce((n, f) => n + f.rooms.length, 0),
    [cockpitVisibleFloors]
  );
  const maxRoomsInPartition = useMemo(
    () => cockpitVisibleFloors.reduce((m, f) => Math.max(m, f.rooms.length), 0),
    [cockpitVisibleFloors]
  );

  const showRefreshing = pageQ.isFetching && !!page;

  const cockpitRobotArmTags = useMemo(() => findRobotArmTagItems(page?.tagItems), [page?.tagItems]);

  /** 性能栏行高以动力站模块实测高度为准，耗电/耗能/机械臂/洗笼机等与动力站齐平 */
  useLayoutEffect(() => {
    if (page?.winccEnabled !== true) {
      setMetricsLaneAlignPx(null);
      return;
    }
    const el = powerStationMetricsRef.current;
    if (!el) {
      setMetricsLaneAlignPx(null);
      return;
    }
    const apply = () => {
      const h = el.getBoundingClientRect().height;
      setMetricsLaneAlignPx(h > 1 ? Math.ceil(h) : null);
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page?.winccEnabled, page?.tagItems, showRefreshing]);

  const setPartitionVisible = useCallback((tabKey: string, visible: boolean) => {
    setHiddenPartitionTabKeys((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(tabKey);
      else next.add(tabKey);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      setStripRect({ w: Math.max(0, r.width), h: Math.max(0, r.height) });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cockpitVisibleFloors.length, pageQ.isSuccess, sidebarDock.leftOpen, sidebarDock.rightOpen]);

  if (pageQ.isError) {
    console.warn("[AnimalRoomCockpit] GET /animal-room failed", pageQ.error);
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden",
        "bg-gradient-to-br from-slate-950 via-indigo-950/90 to-slate-950 text-slate-100"
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `radial-gradient(circle at 15% 20%, rgba(34, 211, 238, 0.12) 0%, transparent 42%),
            radial-gradient(circle at 85% 75%, rgba(99, 102, 241, 0.14) 0%, transparent 45%)`,
        }}
      />

      <header
        className={cn(
          "relative z-10 shrink-0 border-b shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-slate-950/72",
          "border-cyan-500/20 bg-slate-950/88"
        )}
      >
        <CockpitTopBarFirstRow
          brand={
            <>
              <div
                className={cn(
                  "relative box-border flex shrink-0 items-center leading-none",
                  "h-8 max-h-[2rem] w-auto max-w-[min(9.5rem,42vw)] min-w-0 overflow-visible sm:h-9 sm:max-h-[2.25rem] sm:max-w-[10.5rem]"
                )}
              >
                {!headerLogoFailed ? (
                  <img
                    src={SHSMU_LOGO_URL}
                    alt="上海医学院"
                    width={320}
                    height={96}
                    decoding="async"
                    className="h-full w-auto max-h-full max-w-full object-contain object-left brightness-0 invert opacity-95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
                    onError={() => setHeaderLogoFailed(true)}
                  />
                ) : (
                  <div
                    className="flex h-full w-full min-w-[2rem] items-center justify-center rounded-md bg-gradient-to-br from-cyan-600 to-sky-800 text-[10px] font-bold text-white shadow-inner sm:min-w-[2.25rem] sm:text-[11px]"
                    aria-hidden
                  >
                    医
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <h1 className="animal-telemetry-page-title truncate text-base font-extrabold leading-none sm:text-lg bg-gradient-to-r from-cyan-100 via-sky-200 to-cyan-100 bg-clip-text text-transparent">
                  动物房驾驶舱
                </h1>
              </div>
            </>
          }
          middle={
            cockpitFloors.length > 0 ? (
              <>
                <span className="pointer-events-none shrink-0 text-[9px] font-medium text-cyan-500/90 sm:text-[10px]">分区</span>
                {cockpitFloors.map((f) => (
                  <label
                    key={f.tabKey}
                    className="pointer-events-auto flex max-w-[5.5rem] shrink-0 cursor-pointer items-center gap-0.5 rounded border border-cyan-500/25 bg-slate-950/90 px-1 py-0.5 text-[9px] font-medium text-cyan-100/90 shadow-sm backdrop-blur-sm sm:max-w-[6.5rem] sm:gap-1 sm:px-1.5 sm:py-1 sm:text-[10px]"
                    title={`${f.title}：取消勾选则隐藏该列；剩余列均分宽度。柱图横轴为房号或末段简称（无编号时），角度随宽度自动，悬停查看全名。`}
                  >
                    <input
                      type="checkbox"
                      className="h-2.5 w-2.5 shrink-0 accent-cyan-400 sm:h-3 sm:w-3"
                      checked={!hiddenPartitionTabKeys.has(f.tabKey)}
                      onChange={(e) => setPartitionVisible(f.tabKey, e.target.checked)}
                    />
                    <span className="min-w-0 truncate">{f.title}</span>
                  </label>
                ))}
                <div
                  className="shrink-0 rounded border border-slate-600/35 bg-slate-950/90 px-1.5 py-0.5 text-[9px] text-slate-400 shadow-sm backdrop-blur-sm sm:px-2 sm:py-1 sm:text-[10px]"
                  title="当前可见分区与房间数"
                >
                  分区 {cockpitVisibleFloors.length} · 房间 {roomCount}
                  {maxRoomsInPartition > 0 ? ` · 列最多 ${maxRoomsInPartition}` : ""}
                </div>
              </>
            ) : null
          }
          actions={
            <>
              {page?.fetchedAt ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-slate-800/90 px-1.5 py-0 font-mono text-[9px] text-cyan-50/90 ring-1 ring-cyan-500/25 sm:px-2 sm:text-[10px]"
                  title={`最近拉取 ${formatTelemetryTs(page.fetchedAt)}`}
                >
                  <Clock className="h-2.5 w-2.5 shrink-0 opacity-70 sm:h-3 sm:w-3" aria-hidden />
                  <span>{formatTelemetryTs(page.fetchedAt)}</span>
                </span>
              ) : null}
              {showRefreshing ? (
                <span className="shrink-0 whitespace-nowrap text-[9px] text-cyan-300/80 sm:text-[10px]">刷新中…</span>
              ) : null}
              <button
                type="button"
                onClick={handleReturn}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-cyan-500/35 bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-50 shadow-sm transition-colors hover:bg-slate-800/95 sm:px-2 sm:text-xs"
                title={returnToPath ? "返回进入前页面" : "返回上一页"}
              >
                <ArrowLeft className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
                <span>返回</span>
              </button>
            </>
          }
        />
        {/* 性能指标栏：高度随内容；勿设过大 min-h，否则会占满视窗上部、挤压下方坐标图区域 */}
        <div className="border-t border-cyan-500/15 bg-slate-950/60 px-2 py-2 sm:px-3 sm:py-2.5">
          <div
            className="flex min-h-0 min-w-0 flex-nowrap items-stretch gap-2 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={metricsLaneAlignPx != null ? { minHeight: metricsLaneAlignPx } : undefined}
          >
            <StatPlaceholder variant="metricsPill" icon={Zap} title="耗电" hint="占位：后续由算法汇总用电" />
            <StatPlaceholder variant="metricsPill" icon={Gauge} title="耗能" hint="占位：后续由算法汇总能耗" />
            <StatPlaceholder variant="metricsPill" icon={Forklift} title="AGV" hint="占位：运行台数/任务/故障" />
            {page?.winccEnabled === true && cockpitRobotArmTags.length > 0 ? (
              <CockpitRobotArmMetricSlots tagItems={page.tagItems} telemetryFetching={showRefreshing} />
            ) : (
              <StatPlaceholder
                variant="metricsPill"
                icon={Cpu}
                title="机械臂"
                hint="WinCC 启用且变量名/展示名含「机械臂」时，此处按台数各占一槽（1 台 1 槽、2 台 2 槽）；1=运行中，0=停机"
              />
            )}
            <StatPlaceholder variant="metricsPill" icon={Factory} title="洗笼机" hint="占位：运行周期/状态" />
            {page?.winccEnabled === true ? (
              <CockpitPowerStationMetrics
                ref={powerStationMetricsRef}
                tagItems={page.tagItems}
                telemetryFetching={showRefreshing}
              />
            ) : null}
          </div>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-row overflow-hidden">
        {sidebarDock.leftOpen ? (
          <aside
            style={{ width: COCKPIT_SIDEBAR_PANEL_PX, minWidth: COCKPIT_SIDEBAR_PANEL_PX }}
            className="flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-cyan-500/15 bg-slate-950/40"
            aria-label="左侧边栏"
          >
            <div className="flex shrink-0 items-center justify-between gap-1 border-b border-cyan-500/10 px-2 py-1">
              <span className="min-w-0 truncate text-[10px] font-semibold text-cyan-200/90" title="与动物房「机房」Tab 同源">
                机房参数
              </span>
              <button
                type="button"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-cyan-500/25 bg-slate-900/80 text-cyan-200/90 shadow-sm hover:bg-cyan-500/10"
                title="收起左侧栏"
                aria-label="收起左侧栏"
                onClick={() => setSidebarDock((d) => ({ ...d, leftOpen: false }))}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2 sm:p-3">
              <CockpitMachineRoomSidebar tab={cockpitMachineRoomTab} winccEnabled={page?.winccEnabled === true} />
            </div>
          </aside>
        ) : null}

        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-1.5 sm:p-2.5">
            {!sidebarDock.leftOpen ? (
              <button
                type="button"
                className="pointer-events-auto absolute left-2 top-1/2 z-30 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-500/35 bg-slate-950/90 text-cyan-200/95 shadow-md shadow-black/35 backdrop-blur-sm transition hover:border-cyan-400/50 hover:bg-slate-900/95 hover:text-cyan-50 active:scale-95"
                title="展开左侧栏"
                aria-label="展开左侧栏"
                onClick={() => setSidebarDock((d) => ({ ...d, leftOpen: true }))}
              >
                <ChevronRight className="h-3 w-3" aria-hidden />
              </button>
            ) : null}
            {!sidebarDock.rightOpen ? (
              <button
                type="button"
                className="pointer-events-auto absolute right-2 top-1/2 z-30 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-500/35 bg-slate-950/90 text-cyan-200/95 shadow-md shadow-black/35 backdrop-blur-sm transition hover:border-cyan-400/50 hover:bg-slate-900/95 hover:text-cyan-50 active:scale-95"
                title="展开右侧栏"
                aria-label="展开右侧栏"
                onClick={() => setSidebarDock((d) => ({ ...d, rightOpen: true }))}
              >
                <ChevronLeft className="h-3 w-3" aria-hidden />
              </button>
            ) : null}
            <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-cyan-500/20 bg-slate-950/30 shadow-inner shadow-black/30">
            <div
              ref={stripRef}
              className="flex h-full min-h-0 min-w-0 flex-1 flex-row gap-1.5 overflow-hidden px-1 pb-0.5 pt-0 sm:gap-2 sm:px-2 sm:pb-1"
            >
              {pageQ.isLoading && !page ? (
                <div className="flex flex-1 items-center justify-center text-xs text-slate-400">加载遥测数据…</div>
              ) : null}
              {pageQ.isError && !page ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-4 text-center text-xs text-rose-100">
                  加载失败，请检查网络与后端 /api/v1/telemetry/wincc/animal-room
                </div>
              ) : null}
              {!pageQ.isLoading && cockpitFloors.length > 0 && cockpitVisibleFloors.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-cyan-500/25 bg-slate-950/40 px-3 py-4 text-center text-xs text-cyan-100/90">
                  当前所有分区均已隐藏。请在顶栏首行「分区」勾选至少一个分区；隐藏不需要的楼层后，其余列会横向均分，柱图横轴为房号或末段简称（角度随宽度自动），完整房间名请悬停查看。
                </div>
              ) : null}
              {!pageQ.isLoading && cockpitFloors.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-950/30 px-3 py-4 text-center text-xs text-amber-100/90">
                  暂无含温/湿/压读数的结构化分区。请检查 WinCC 映射与测点。
                </div>
              ) : null}

              {cockpitVisibleFloors.map((floor) => (
                <CockpitPartitionColumn
                  key={floor.tabKey}
                  floor={floor}
                  stripRect={stripRect}
                  partitionCount={cockpitVisibleFloors.length}
                />
              ))}
            </div>
          </section>
        </div>

        {sidebarDock.rightOpen ? (
          <aside
            style={{ width: COCKPIT_SIDEBAR_PANEL_PX, minWidth: COCKPIT_SIDEBAR_PANEL_PX }}
            className="flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-cyan-500/15 bg-slate-950/40"
            aria-label="右侧边栏"
          >
            <div className="flex shrink-0 items-center justify-between gap-1 border-b border-cyan-500/10 px-2 py-1">
              <button
                type="button"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-cyan-500/25 bg-slate-900/80 text-cyan-200/90 shadow-sm hover:bg-cyan-500/10"
                title="收起右侧栏"
                aria-label="收起右侧栏"
                onClick={() => setSidebarDock((d) => ({ ...d, rightOpen: false }))}
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span className="text-[10px] font-semibold text-cyan-200/90">右侧</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2 sm:p-3">
              <p className="text-[10px] leading-relaxed text-slate-400">
                固定宽度 {COCKPIT_SIDEBAR_PANEL_PX}px；收起后主区边缘会显示悬浮展开钮。
              </p>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
