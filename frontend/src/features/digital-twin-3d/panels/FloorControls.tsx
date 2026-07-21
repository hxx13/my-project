import { useStore } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';

const FOCUS: any = () => (window as any).__dt3d_focusFloor;
const RESET: any = () => (window as any).__dt3d_resetCamera;

export default function FloorControls() {
  const { floorNames, focusedFloor, setFocusedFloor, floorMode, setFloorMode } = useStore(
    useShallow((s) => ({ floorNames: s.floorNames, focusedFloor: s.focusedFloor, floorMode: s.floorMode, setFocusedFloor: s.setFocusedFloor, setFloorMode: s.setFloorMode })),
  );

  return (
    <div className="absolute left-4 bottom-4 z-10 pointer-events-none">
      <div className="flex flex-col gap-2 pointer-events-auto">
        <div className="flex gap-1.5">
          {floorNames.map((name) => (
            <button key={name}
              onClick={() => { FOCUS()?.(name); setFocusedFloor(name); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${focusedFloor === name ? 'bg-blue-500 text-white' : 'bg-white/85 backdrop-blur-lg border border-white/60 text-slate-700 hover:bg-white'}`}
            >{name}</button>
          ))}
          <button onClick={() => { RESET()?.(); setFocusedFloor(null); }}
            className="px-2 py-1.5 rounded-lg text-xs font-bold bg-white/85 backdrop-blur-lg border border-white/60 text-slate-500">还原</button>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setFloorMode(floorMode === 'exploded' ? 'stacked' : 'exploded')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${floorMode === 'exploded' ? 'bg-orange-500 text-white' : 'bg-white/85 text-orange-700'}`}>{floorMode === 'exploded' ? '💥 堆叠' : '💥 爆炸'}</button>
          <button onClick={() => setFloorMode(floorMode === 'staircase' ? 'stacked' : 'staircase')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${floorMode === 'staircase' ? 'bg-sky-500 text-white' : 'bg-white/85 text-sky-700'}`}>{floorMode === 'staircase' ? '📶 堆叠' : '📶 阶梯'}</button>
        </div>
      </div>
    </div>
  );
}
