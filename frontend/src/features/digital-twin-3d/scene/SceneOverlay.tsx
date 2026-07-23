import { useStore } from '../store/useStore';
import { RoomInfoCard } from '../components/InfoCard';

/**
 * Canvas 外部屏幕浮窗：读取 store.screenProjection（由 CardTracker 每帧更新），
 * 将卡片定位在 3D 目标物体的屏幕投影位置上方。
 */
export default function SceneOverlay() {
  const node = useStore((s) => s.selectedNode);
  const proj = useStore((s) => s.screenProjection);
  const clear = useStore((s) => s.setSelectedNode);

  if (!node || !proj || !proj.visible) return null;

  return (
    <div
      className="fixed z-[var(--z-modal,800)] pointer-events-none"
      style={{
        left: proj.x,
        top: proj.y,
        transform: 'translate(-50%, calc(-100% - 16px))',
      }}
    >
      <div className="pointer-events-auto">
        <RoomInfoCard
          roomName={node.name}
          roomType={node.type}
          onClose={() => clear(null)}
        />
      </div>
      {/* 小三角指示器 */}
      <div className="flex justify-center pointer-events-none">
        <div className="w-3 h-3 rotate-45 bg-[var(--app-color-surface-elevated)]/95 border-r border-b border-[var(--app-color-border-default)] -mt-[7px]" />
      </div>
    </div>
  );
}
