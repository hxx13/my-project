import { Html } from '@react-three/drei';
import { useStore } from '../store/useStore';

export default function SceneOverlay() {
  const node = useStore((s) => s.selectedNode);
  const clear = useStore((s) => s.setSelectedNode);

  if (!node) return null;

  return (
    <Html key={node.name} position={node.worldPos} center distanceFactor={30} zIndexRange={[100, 0]}>
      <div className="bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl rounded-xl px-3 py-2 text-xs whitespace-nowrap pointer-events-auto">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="font-bold text-slate-800">{node.name}</span>
            <span className="ml-2 text-slate-400 text-[10px]">{node.type}</span>
          </div>
          <button onClick={() => clear(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      </div>
    </Html>
  );
}
