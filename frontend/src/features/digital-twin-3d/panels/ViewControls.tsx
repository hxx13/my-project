const FLY: any = () => (window as any).__dt3d_flyTo;
const RESET: any = () => (window as any).__dt3d_resetCamera;
const FOCUS: any = () => (window as any).__dt3d_focusFloor;

const presets = [
  { label: '俯瞰', icon: '🔽', action: () => FLY()?.([0, 45, 1], [0, 8, 0]) },
  { label: '正面', icon: '🔲', action: () => FLY()?.([0, 10, 45], [0, 8, 0]) },
  { label: '顶视', icon: '⬇',  action: () => FLY()?.([0, 40, 0.1], [0, 8, 0]) },
  { label: '复位', icon: '🏠', action: () => RESET()?.() },
];

export default function ViewControls() {
  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2 pointer-events-auto">
      {presets.map((p) => (
        <button key={p.label} onClick={p.action}
          className="w-10 h-10 rounded-xl bg-white/85 backdrop-blur-lg border border-white/60 shadow-sm flex items-center justify-center text-lg hover:bg-white transition-colors"
          title={p.label} />
      ))}
    </div>
  );
}
