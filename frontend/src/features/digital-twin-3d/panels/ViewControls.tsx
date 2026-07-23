import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';

// P2.8: 面板令牌 class 常量（替代硬编码 Tailwind 颜色）
const BTN_BASE = 'w-10 h-10 rounded-xl backdrop-blur-lg border shadow-sm flex items-center justify-center text-lg transition-colors disabled:opacity-40';
const BTN_STYLE = `${BTN_BASE} bg-[var(--app-color-surface-elevated)]/85 border-[var(--app-color-border-subtle)]/60 hover:bg-[var(--app-color-surface-elevated)]`;

export default function ViewControls() {
  const { flyTo, resetCamera, globalCenter, globalRadius } = useStore(
    useShallow((s) => ({
      flyTo: s._cameraActions.flyTo,
      resetCamera: s._cameraActions.resetCamera,
      globalCenter: s.globalCenter,
      globalRadius: s.globalRadius,
    })),
  );

  // P2.10: Escape 键取消选中
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().setSelectedNode(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const presets = [
    {
      label: '俯瞰', icon: '🔽',
      action: () => {
        const dist = globalRadius * 2.5;
        const phi = Math.PI / 5;
        flyTo?.([globalCenter[0], globalCenter[1] + dist * 0.7, globalCenter[2] + dist * 0.2], globalCenter);
      },
    },
    {
      label: '正面', icon: '🔲',
      action: () => {
        const dist = globalRadius * 2.5;
        flyTo?.([globalCenter[0], globalCenter[1] + dist * 0.3, globalCenter[2] + dist], globalCenter);
      },
    },
    {
      label: '顶视', icon: '⬇',
      action: () => {
        const dist = globalRadius * 3.0;
        flyTo?.([globalCenter[0], globalCenter[1] + dist, globalCenter[2] + 0.1], globalCenter);
      },
    },
    { label: '复位', icon: '🏠', action: () => resetCamera?.() },
  ];

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-[var(--z-dropdown,200)] pointer-events-none">
      <div className="flex flex-col gap-2 pointer-events-auto">
        {presets.map((p) => (
          <button key={p.label} onClick={p.action} disabled={!flyTo} className={BTN_STYLE} title={p.label} aria-label={p.label}>
            {p.icon}
          </button>
        ))}
      </div>
      <div className="mt-3 pointer-events-auto">
        <div className="text-[10px] text-[var(--app-color-text-secondary)] bg-[var(--app-color-surface-elevated)]/80 backdrop-blur rounded-md px-2 py-1 text-center leading-relaxed">
          🖱 左键旋转<br />右键/中键平移<br />滚轮缩放
        </div>
      </div>
    </div>
  );
}
