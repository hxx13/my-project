import { useRef, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';

// P2.8: 面板令牌
const SELECT_STYLE = 'px-3 py-2 rounded-xl text-sm font-bold bg-[var(--app-color-surface-elevated)]/85 backdrop-blur-lg border border-[var(--app-color-border-subtle)]/60 text-[var(--app-color-text-primary)]';
const BTN_STYLE = 'px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40';

export default function TourControls() {
  const { isTouring, tourStyle, startTour, stopTour, flyTo, killAnimation, globalCenter, globalRadius } =
    useStore(
      useShallow((s) => ({
        isTouring: s.isTouring,
        tourStyle: s.tourStyle,
        startTour: s.startTour,
        stopTour: s.stopTour,
        flyTo: s._cameraActions.flyTo,
        killAnimation: s._cameraActions.killAnimation,
        globalCenter: s.globalCenter,
        globalRadius: s.globalRadius,
      })),
    );

  const runningRef = useRef(false);
  const timerIds = useRef<ReturnType<typeof setTimeout>[]>([]);

  const waypoints = useMemo(() => {
    const dist = globalRadius * 2.0;
    const cx = globalCenter[0], cy = globalCenter[1], cz = globalCenter[2];
    if (tourStyle === 'hero') {
      return [
        [cx, cy + dist * 1.2, cz + dist * 1.5],
        [cx, cy + dist * 0.6, cz + dist * 0.7],
        [cx, cy + dist * 0.2, cz + dist * 0.3],
      ] as [number, number, number][];
    }
    return [
      [cx + dist, cy + dist * 0.5, cz],
      [cx, cy + dist * 0.5, cz - dist],
      [cx - dist, cy + dist * 0.5, cz],
      [cx, cy + dist * 0.5, cz + dist],
    ] as [number, number, number][];
  }, [globalCenter, globalRadius, tourStyle]);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      timerIds.current.forEach(clearTimeout);
      timerIds.current = [];
      if (useStore.getState().isTouring) useStore.getState().stopTour();
      killAnimation?.();
    };
  }, []);

  const clearTimers = () => { timerIds.current.forEach(clearTimeout); timerIds.current = []; };

  const runTour = async () => {
    if (!startTour()) return;
    runningRef.current = true;
    for (const wp of waypoints) {
      if (!useStore.getState().isTouring || !runningRef.current) { clearTimers(); if (useStore.getState().isTouring) stopTour(); return; }
      flyTo?.(wp, globalCenter, 2.5);
      await new Promise((r) => { const id = setTimeout(r, 3000); timerIds.current.push(id); });
      timerIds.current = timerIds.current.filter((id) => id !== undefined);
    }
    clearTimers();
    runningRef.current = false;
    if (useStore.getState().isTouring) stopTour();
  };

  const handleStop = () => { runningRef.current = false; clearTimers(); killAnimation?.(); stopTour(); };

  return (
    <div className="absolute right-4 bottom-4 z-[var(--z-dropdown,200)] pointer-events-none">
      <div className="flex gap-2 pointer-events-auto">
        {!isTouring && (
          <select
            value={tourStyle}
            onChange={(e) => useStore.setState({ tourStyle: e.target.value as 'orbit' | 'hero' })}
            className={SELECT_STYLE}
            aria-label="巡航风格"
          >
            <option value="orbit">环绕</option>
            <option value="hero">推近</option>
          </select>
        )}
        <button
          onClick={isTouring ? handleStop : runTour}
          disabled={!flyTo}
          aria-label={isTouring ? '停止巡航' : '启动巡航'}
          className={`${BTN_STYLE} ${isTouring ? 'bg-red-500 text-white' : 'bg-[var(--app-color-surface-elevated)]/85 backdrop-blur-lg border border-[var(--app-color-border-subtle)]/60 text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-elevated)]'}`}
        >
          {isTouring ? '⏹ 停止' : '🚀 巡航'}
        </button>
      </div>
    </div>
  );
}
