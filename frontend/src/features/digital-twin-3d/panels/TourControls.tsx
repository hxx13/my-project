import { useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';

const FLY: any = () => (window as any).__dt3d_flyTo;

const ORBIT_WAYPOINTS: [number, number, number][] = [
  [45, 14, 0], [0, 14, -45], [-45, 14, 0], [0, 14, 45],
];
const HERO_WAYPOINTS: [number, number, number][] = [
  [0, 35, 60], [0, 20, 30], [0, 10, 15],
];
const TARGET: [number, number, number] = [0, 8, 0];

export default function TourControls() {
  const isTouring = useStore((s) => s.isTouring);
  const tourStyle = useStore((s) => s.tourStyle);
  const startTour = useStore((s) => s.startTour);
  const stopTour = useStore((s) => s.stopTour);
  const mountedRef = useRef(true);
  const timerIds = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const runTour = async () => {
    if (useStore.getState().isTouring) return; // 防重入
    startTour();
    const waypoints = useStore.getState().tourStyle === 'hero' ? HERO_WAYPOINTS : ORBIT_WAYPOINTS;
    for (const wp of waypoints) {
      if (!useStore.getState().isTouring) { stopTour(); return; }
      if (!mountedRef.current) return;
      FLY()?.(wp, TARGET, 2.5);
      await new Promise((r) => {
        const id = setTimeout(r, 3000);
        timerIds.current.push(id);
      });
    }
    stopTour();
  };

  const handleStop = () => {
    stopTour();
    timerIds.current.forEach(clearTimeout);
    timerIds.current = [];
  };

  return (
    <div className="absolute right-4 bottom-4 z-10 flex gap-2 pointer-events-auto">
      {!isTouring && (
        <select
          value={tourStyle}
          onChange={(e) => useStore.setState({ tourStyle: e.target.value as 'orbit' | 'hero' })}
          className="px-3 py-2 rounded-xl text-sm font-bold bg-white/85 backdrop-blur-lg border border-white/60 text-slate-700"
        >
          <option value="orbit">环绕</option>
          <option value="hero">推近</option>
        </select>
      )}
      <button onClick={isTouring ? handleStop : runTour}
        className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${isTouring ? 'bg-red-500 text-white' : 'bg-white/85 backdrop-blur-lg border border-white/60 text-slate-700 hover:bg-white'}`}
      >{isTouring ? '⏹ 停止' : '🚀 巡航'}</button>
    </div>
  );
}
