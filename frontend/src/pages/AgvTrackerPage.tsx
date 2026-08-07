import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { fetchAgvCurrent, fetchAgvRecent, fetchAgvTrajectory, fetchCoordConfigs, updateCoordConfig, type AgvRobotStatus, type HistoryPlaybackResponse } from "@/api/domains/agv.api";
import { useSpatialElements, useRouteTopology, buildTopologyOverlays, useGenerateRouteTopology, useDeleteSpatialElement, useSaveSpatialElement, type AgvSpatialElement } from "@/api/domains/agv-analysis.api";
import { useAgvTrailRef } from "@/features/agv-tracker/useAgvTrailRef";
import { smartSampleTrail, type TrailPoint } from "@/features/agv-tracker/agvAnalytics";
import { AGV_ZONE_MAP } from "@/features/agv-tracker/zoneGrouping";
import { useAgvTagManagement } from "@/features/agv-tracker/useAgvTagManagement";
import { useAgvPickMode } from "@/features/agv-tracker/useAgvPickMode";
import { useAgvPlayback } from "@/features/agv-tracker/useAgvPlayback";
import { useAgvUndo } from "@/features/agv-tracker/useAgvUndo";
import { useAgvCoordPresets, getStoredScales } from "@/features/agv-tracker/useAgvCoordPresets";
import { useAgvZoneManagement } from "@/features/agv-tracker/useAgvZoneManagement";
import { useAgvDataRefresh } from "@/features/agv-tracker/useAgvDataRefresh";
import { buildAgvInfo } from "@/features/agv-tracker/buildAgvInfo";
import AgvQuadrant from "@/features/agv-tracker/AgvQuadrant";
import AgvDualQuadrant from "@/features/agv-tracker/AgvDualQuadrant";
import AgvSidebar from "@/features/agv-tracker/AgvSidebar";
import AgvAnalysisModal from "@/features/agv-tracker/AgvAnalysisModal";
import AgvTagFilterBar from "@/features/agv-tracker/AgvTagFilterBar";
import AgvPickModeBar from "@/features/agv-tracker/AgvPickModeBar";
import AgvZonePopover from "@/features/agv-tracker/AgvZonePopover";

const ROBOTS = [
  { ip: "172.22.159.16", label: "AGV-1", color: "#3b82f6" },
  { ip: "172.22.159.18", label: "AGV-2", color: "#22c55e" },
  { ip: "172.22.159.20", label: "AGV-3", color: "#f59e0b" },
  { ip: "172.22.159.22", label: "AGV-4", color: "#8b5cf6" },
];

function smartSample(points: { x: number; y: number; angle: number; ts: number }[]): typeof points {
  return smartSampleTrail(points);
}

/** Seed historical trail data on mount with 24h→7d fallback for offline AGVs */
function useTrailSeed(seed: (ip: string, points: TrailPoint[]) => void, getTrail: (ip: string) => TrailPoint[]) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const now = new Date().toISOString();
    const ago24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const ago7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

    Promise.all(ROBOTS.map((r) =>
      fetchAgvTrajectory(r.ip, ago24h, now, 10000).then((rows) => {
        if (cancelled || !rows.length) return;
        const sorted = rows
          .filter((row) => row.x != null && row.y != null)
          .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
          .map((row) => ({ x: row.x, y: row.y, angle: row.angle ?? 0, ts: new Date(row.recorded_at).getTime() }));
        const filtered = smartSample(sorted);
        if (filtered.length > 0) seed(r.ip, filtered);
      }).catch(() => {}),
    )).finally(() => {
      if (cancelled) return;
      for (const r of ROBOTS) {
        if (getTrail(r.ip).length > 0) continue;
        const doFallback = (endTime: string, depth: number) => {
          if (depth > 5) return;
          fetchAgvTrajectory(r.ip, ago7d, endTime, 2000).then((rows) => {
            if (cancelled || !rows.length) return;
            const pts = rows.filter(row => row.x != null && row.y != null)
              .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
              .map(row => ({ x: row.x!, y: row.y!, angle: row.angle ?? 0, ts: new Date(row.recorded_at).getTime() }));
            if (pts.length === 0) return;
            const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
            if (Math.max(...xs) - Math.min(...xs) < 0.1 && Math.max(...ys) - Math.min(...ys) < 0.1) {
              seed(r.ip, pts);
              doFallback(new Date(pts[0].ts - 1000).toISOString(), depth + 1);
              return;
            }
            seed(r.ip, pts);
          }).catch(() => {});
        };
        doFallback(now, 0);
      }
      setTick((t) => t + 1);
    });
    return () => { cancelled = true; };
  }, [seed, getTrail]);
}

export default function AgvTrackerPage() {
  // ── View mode ──
  const [focusedAgvIp, setFocusedAgvIp] = useState<string | null>(null);
  const [tagControlIp, setTagControlIp] = useState(ROBOTS[0].ip);

  // ── UI toggles ──
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [routeMode, setRouteMode] = useState(false);
  const [followMode, setFollowMode] = useState(false);
  const [vehicleIcon, setVehicleIcon] = useState<'arrow' | 'forklift'>(
    () => (localStorage.getItem('agvVehicleIcon') as 'arrow' | 'forklift') || 'forklift'
  );
  useEffect(() => { localStorage.setItem('agvVehicleIcon', vehicleIcon); }, [vehicleIcon]);
  const [coordEditMode, setCoordEditMode] = useState(false);
  const [zoneEditMode, setZoneEditMode] = useState(false);
  const [hiddenAgvs, setHiddenAgvs] = useState<Set<string>>(new Set());
  const [hiddenRouteTypes, setHiddenRouteTypes] = useState<Set<string>>(new Set());

  // ── Custom hooks ──
  const {
    hiddenTagsByIp, toggleHiddenTag,
    customTags, handleAddCustomTag, handleDeleteCustomTag,
    allTagOptions, allTagColors, creatableTags,
  } = useAgvTagManagement(tagControlIp);

  const {
    pickMode, pickTwoPoint, pickAnchor, pendingPick,
    handleStartPick, handleStartRectPick, handlePointPicked, handleCancelPick, handleRectDrawn,
    setPendingPick,
  } = useAgvPickMode();

  const {
    playback, setPlayback, playbackSpeed, setPlaybackSpeed,
    playbackPlaying, setPlaybackPlaying, playbackProgress, setPlaybackProgress,
    progressRef: pbProgressRef,
    startHistoryPlayback, clearPlayback, stopPlaybackKeepTimeline, handlePlaybackPlay,
  } = useAgvPlayback();

  const { undoLabel, pushUndo, handleUndo } = useAgvUndo();

  // ── Data fetching ──
  const { data: coordConfigs } = useQuery({ queryKey: ["agvCoordConfigs"], queryFn: fetchCoordConfigs, staleTime: 60_000 });
  const isPlaybackActive = playback != null && playbackPlaying;
  const { data: recentData, dataUpdatedAt } = useQuery({ queryKey: ["agvRecent"], queryFn: () => fetchAgvRecent(2), refetchInterval: isPlaybackActive ? false : 500, staleTime: 0, refetchOnWindowFocus: true });
  const { data } = useQuery({ queryKey: ["agvCurrent"], queryFn: fetchAgvCurrent, refetchInterval: isPlaybackActive ? false : 500, staleTime: 0, refetchOnWindowFocus: true });
  const { data: zones = [] } = useSpatialElements();
  const { data: routeTopology } = useRouteTopology();

  const { append, seed, getTrail, clearAll } = useAgvTrailRef();
  useTrailSeed(seed, getTrail);

  const { robotAnalytics, dwellByIp, getStatus, getLastPolled } =
    useAgvDataRefresh(recentData, dataUpdatedAt, data, append, seed, getTrail, clearAll);

  const qc = useQueryClient();
  const { coordPresetSaved, handleSaveCoordPreset, handleRestoreCoordPreset, handleResetCoordZero, handleCoordFrameScale, handleCoordFrameMove, handleCoordFrameRotate } =
    useAgvCoordPresets(coordConfigs, qc, pushUndo);

  const generateTopologyMut = useGenerateRouteTopology();
  const deleteZoneMut = useDeleteSpatialElement();
  const saveZoneMut = useSaveSpatialElement();

  const {
    zonePopover, setZonePopover, selectedZoneId, setSelectedZoneId,
    handleQuickSaveZone, handleZoneClick, handleDeleteZone, handleZoneColorChange,
    handleZoneReshape,
    pairZoneOverlays, robotZoneOverlays, pickZoneRef,
  } = useAgvZoneManagement(zones, hiddenTagsByIp, tagControlIp, allTagColors, qc, pushUndo, saveZoneMut as UseMutationResult<any, Error, Partial<AgvSpatialElement>, unknown>, deleteZoneMut, pendingPick, setPendingPick, customTags);

  // ── Focused mode: sync tagControlIp, clear playback on exit ──
  useEffect(() => {
    if (focusedAgvIp !== null) {
      setTagControlIp(focusedAgvIp);
    } else {
      setTagControlIp(ROBOTS[0].ip); // 回到全局视图 → 重置为默认
      setPlayback(null); setPlaybackProgress(1); setPlaybackPlaying(false);
    }
  }, [focusedAgvIp]);

  // ── Route overlays ──
  const routeOverlays = useMemo(() => {
    const all = buildTopologyOverlays(routeTopology);
    return hiddenRouteTypes.size === 0 ? all : all.filter(r => !hiddenRouteTypes.has(r.routeType));
  }, [routeTopology, hiddenRouteTypes]);

  // ── AGV info builder ──
  const lastKnownRef = useRef<Record<string, Record<string, unknown>>>({});
  const info = (r: typeof ROBOTS[number]) =>
    buildAgvInfo(r, getStatus, getLastPolled, robotAnalytics, dwellByIp, getTrail, coordConfigs, getStoredScales, lastKnownRef);

  const quadrant = (r: typeof ROBOTS[number]) => {
    const i = info(r);
    const isPlaybackActive = playback != null && playback.ip === r.ip && playback.data != null;
    return (
      <div key={r.ip} className="relative h-full">
        <AgvQuadrant ip={i.ip} label={i.label} online={i.online} color={i.color} trail={i.trail}
          x={i.x} y={i.y} angle={i.angle} speed={i.speed} avgSpeed={i.avgSpeed} maxSpeed={i.maxSpeed}
          dwellSpots={i.dwellSpots} battery={i.battery} charging={i.charging}
          taskStatus={i.taskStatus} blocked={i.blocked} emergency={i.emergency}
          station={i.station} mapName={i.mapName}
          confidence={i.confidence} relocStatus={i.relocStatus} loadmapStatus={i.loadmapStatus}
          odo={i.odo} rssi={i.rssi} driverEmc={i.driverEmc}
          forkHeight={i.forkHeight} forkInPlace={i.forkInPlace}
          jackEnable={i.jackEnable} jackState={i.jackState} jackIsFull={i.jackIsFull}
          jackMode={i.jackMode} jackErrorCode={i.jackErrorCode}
          errors={i.errors} warnings={i.warnings} diChannels={i.diChannels}
          coordRotationDeg={i.coordRotationDeg}
          coordOffsetX={i.coordOffsetX} coordOffsetY={i.coordOffsetY} coordScale={i.coordScale}
          zoneOverlays={showZones ? robotZoneOverlays[r.ip] : []}
          routeOverlays={routeMode ? routeOverlays.filter(ro => ro.robotIp === r.ip) : []}
          routeMode={routeMode} followMode={followMode}
          currentActivity={i.currentActivity} vehicleIcon={vehicleIcon}
          pickMode={pickMode} pickTwoPoint={pickTwoPoint} pickAnchor={pickAnchor}
          onPointPick={(x, y) => { pickZoneRef.current = AGV_ZONE_MAP[r.ip] ?? "zone1"; handlePointPicked(x, y); }}
          onRectDrawn={(x1, y1, x2, y2) => { pickZoneRef.current = AGV_ZONE_MAP[r.ip] ?? "zone1"; handleRectDrawn(x1, y1, x2, y2); }}
          onZoneClick={handleZoneClick}
          coordEditMode={coordEditMode} zoneEditMode={zoneEditMode}
          selectedZoneId={selectedZoneId} onZoneSelect={setSelectedZoneId} onZoneReshape={handleZoneReshape}
          onCoordFrameRotate={handleCoordFrameRotate}
          playbackProgressRef={pbProgressRef}
          playbackActive={isPlaybackActive}
          playbackData={isPlaybackActive ? playback!.data! : null}
          playbackPlaying={playbackPlaying} playbackProgress={playbackProgress}
          playbackSpeed={playbackSpeed}
          playbackLoading={playback?.loading ?? false} playbackError={playback?.error ?? null}
          onStartPlayback={(ip, from, to) => startHistoryPlayback(ip, from, to)}
          onClearPlayback={clearPlayback} onStopPlayback={stopPlaybackKeepTimeline}
          onPlaybackPlay={handlePlaybackPlay} onPlaybackPause={() => setPlaybackPlaying(false)}
          onPlaybackProgress={setPlaybackProgress} onPlaybackSpeed={setPlaybackSpeed}
        />
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col relative">
      {/* Tag + Route + AGV visibility filter pill */}
      <AgvTagFilterBar
        showZones={showZones} routeMode={routeMode} zones={zones}
        tagControlIp={tagControlIp}
        hiddenRouteTypes={hiddenRouteTypes}
        onToggleRouteType={(t) => setHiddenRouteTypes(prev => { const n = new Set(prev); if (prev.has(t)) n.delete(t); else n.add(t); return n; })}
        hiddenAgvs={hiddenAgvs}
        onToggleAgvVisibility={(ip) => setHiddenAgvs(prev => { const n = new Set(prev); n.has(ip) ? n.delete(ip) : n.add(ip); return n; })}
        allTagOptions={allTagOptions} hiddenTagsByIp={hiddenTagsByIp}
      />

      {/* Sidebar toolbar */}
      <AgvSidebar
        serverTime={data?.server_time ?? null}
        focusedAgvIp={focusedAgvIp} onFocusedAgvIpChange={setFocusedAgvIp}
        analysisOpen={analysisOpen} onAnalysisToggle={() => setAnalysisOpen(v => !v)}
        showZones={showZones} onToggleZones={() => setShowZones(v => !v)}
        routeMode={routeMode} onToggleRouteMode={() => setRouteMode(v => !v)}
        followMode={followMode} onToggleFollowMode={() => setFollowMode(v => !v)}
        coordEditMode={coordEditMode} onToggleCoordEditMode={() => setCoordEditMode(v => !v)}
        zoneEditMode={zoneEditMode} onToggleZoneEditMode={() => setZoneEditMode(v => !v)}
        vehicleIcon={vehicleIcon} onToggleVehicleIcon={() => setVehicleIcon(v => v === 'arrow' ? 'forklift' : 'arrow')}
        topologyGenerating={generateTopologyMut.isPending}
        onGenerateTopology={() => generateTopologyMut.mutate()}
        onStartRectPick={handleStartRectPick}
        hiddenTagsByIp={hiddenTagsByIp} onToggleHiddenTag={toggleHiddenTag}
        customTags={customTags} onAddCustomTag={handleAddCustomTag} onDeleteCustomTag={handleDeleteCustomTag}
        allTagColors={allTagColors} creatableTags={creatableTags}
        undoLabel={undoLabel} onUndo={handleUndo}
        onSaveCoordPreset={handleSaveCoordPreset} onRestoreCoordPreset={handleRestoreCoordPreset}
        onResetCoordZero={handleResetCoordZero} coordPresetSaved={coordPresetSaved}
      />

      {/* Main content: overview grid or focused single panel */}
      {focusedAgvIp === null ? (
        <div className="flex-1 grid grid-cols-2 gap-2 p-2">
          {[[0, 1], [2, 3]].map(([ai, bi], qi) => {
            const infoA = info(ROBOTS[ai]), infoB = info(ROBOTS[bi]);
            return (
              <AgvDualQuadrant key={`${ai}-${bi}`}
                agvA={infoA} agvB={infoB}
                zoneOverlays={showZones ? pairZoneOverlays[qi] : []}
                routeOverlaysA={routeMode ? routeOverlays.filter(ro => ro.robotIp === ROBOTS[ai].ip) : []}
                routeOverlaysB={routeMode ? routeOverlays.filter(ro => ro.robotIp === ROBOTS[bi].ip) : []}
                routeMode={routeMode} vehicleIcon={vehicleIcon} hiddenAgvs={hiddenAgvs}
                pickMode={pickMode} pickTwoPoint={pickTwoPoint} pickAnchor={pickAnchor}
                onPointPick={(x, y) => { pickZoneRef.current = qi === 0 ? "zone1" : "zone2"; handlePointPicked(x, y); }}
                onRectDrawn={(x1, y1, x2, y2) => { pickZoneRef.current = qi === 0 ? "zone1" : "zone2"; handleRectDrawn(x1, y1, x2, y2); }}
                onZoneClick={handleZoneClick}
                coordEditMode={coordEditMode} zoneEditMode={zoneEditMode}
                selectedZoneId={selectedZoneId} onZoneSelect={setSelectedZoneId}
                onZoneReshape={handleZoneReshape}
                onCoordFrameMove={handleCoordFrameMove} onCoordFrameScale={handleCoordFrameScale}
                onCoordFrameRotate={handleCoordFrameRotate}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex-1 min-h-0 p-2">
          {quadrant(ROBOTS.find(r => r.ip === focusedAgvIp) || ROBOTS[0])}
        </div>
      )}

      {/* Analysis modal */}
      <AgvAnalysisModal
        open={analysisOpen && !pickMode} onClose={() => setAnalysisOpen(false)}
        onRequestPick={handleStartPick} onRequestRectPick={handleStartRectPick}
        pendingPick={pendingPick} onClearPick={() => setPendingPick(null)}
        focusZoneId={zonePopover?.id ?? null}
        creatableTags={creatableTags} allTagColors={allTagColors}
      />

      {/* Quick tag selector (after pick, before modal) */}
      {pendingPick && !pickMode && !analysisOpen && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-[var(--z-overlay)] flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] shadow-lg">
          <span className="text-[10px] text-[var(--app-color-text-secondary)] whitespace-nowrap">
            {'x1' in pendingPick ? '矩形区域 · 选择标签' : '标记点 · 选择标签'}
          </span>
          <div className="flex gap-1">
            {creatableTags.map(tag => (
              <button key={tag} onClick={() => handleQuickSaveZone(tag)} disabled={saveZoneMut.isPending}
                className="px-2.5 py-1 rounded-full text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: allTagColors[tag] || "#6b7280" }}>{tag}</button>
            ))}
          </div>
          <button onClick={() => setPendingPick(null)} className="text-[10px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]">取消</button>
        </div>
      )}

      {/* Pick mode hint bar — only when pick mode is active */}
      {pickMode && (
        <AgvPickModeBar pickTwoPoint={pickTwoPoint} pickAnchor={pickAnchor} onCancel={handleCancelPick} />
      )}

      {/* Zone popover (normal + edit mode) — only when a zone is selected */}
      {zonePopover && (
        <AgvZonePopover
        zonePopover={zonePopover}
        zoneEditMode={zoneEditMode}
        coordEditMode={coordEditMode}
        creatableTags={creatableTags}
        allTagColors={allTagColors}
        zones={zones}
        onColorChange={handleZoneColorChange}
        onEdit={() => { setAnalysisOpen(true); setZonePopover(null); }}
        onDelete={handleDeleteZone}
        onClose={() => { setZonePopover(null); setSelectedZoneId(null); }}
        onTagToggle={(zoneId, tag, active) => {
          const z = zones.find(zz => zz.id === zoneId);
          if (!z) return;
          const tags: string[] = (() => { try { return JSON.parse(z.semanticTags || "[]"); } catch { return []; } })();
          const next = active ? tags.filter(t => t !== tag) : [...tags, tag];
          qc.setQueryData<import("@/api/domains/agv-analysis.api").AgvSpatialElement[]>(["agvSpatialElements"], (old) =>
            old?.map(zz => zz.id === zoneId ? { ...zz, semanticTags: JSON.stringify(next) } : zz));
          saveZoneMut.mutate({ id: zoneId, semanticTags: JSON.stringify(next) } as import("@/api/domains/agv-analysis.api").AgvSpatialElement);
        }}
      />
      )}

      {/* Edit mode hint */}
      {(coordEditMode || zoneEditMode) && !zonePopover && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--z-tooltip)] pointer-events-none">
          <span className="text-[10px] text-[var(--app-color-text-tertiary)] bg-[var(--app-color-surface-container)]/80 backdrop-blur px-3 py-1 rounded-full border border-[var(--app-color-border-default)]">
            编辑模式已开启 · 点击区域选中后可拖拽调整
          </span>
        </div>
      )}
    </div>
  );
}
