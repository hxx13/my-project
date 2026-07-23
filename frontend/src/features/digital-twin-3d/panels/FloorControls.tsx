import { useState } from 'react';
import { useStore } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import type { ExplodeConfig } from '../store/useStore';

const FLOOR_BTN = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 ${
    active
      ? 'bg-[var(--app-color-accent)] text-white'
      : 'bg-[var(--app-color-surface-elevated)]/85 backdrop-blur-lg border border-[var(--app-color-border-subtle)]/60 text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-elevated)]'
  }`;
const MODE_BTN = (active: boolean) =>
  `px-3 py-1 rounded-md text-xs font-bold transition-colors ${
    active
      ? 'bg-[var(--app-color-accent)] text-white'
      : 'bg-[var(--app-color-surface-elevated)]/85 text-[var(--app-color-text-primary)]'
  }`;

function Slider({ label, value, min, max, step, onChange, unit = '' }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; unit?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-[var(--app-color-text-secondary)]">
      <span className="w-12 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-[var(--app-color-accent)]" />
      <span className="w-12 text-right tabular-nums text-[var(--app-color-text-primary)]">{value}{unit}</span>
    </label>
  );
}

function NumberInput({ label, value, onChange, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number;
}) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-[var(--app-color-text-secondary)]">
      <span className="w-3 text-right">{label}</span>
      <input type="number" value={value} step={step}
        onChange={(e) => { const n = Number(e.target.value); if (!isNaN(n)) onChange(n); }}
        className="w-14 px-1 py-0.5 rounded text-[10px] tabular-nums bg-[var(--app-color-surface-page)] border border-[var(--app-color-border-subtle)]/50 text-[var(--app-color-text-primary)] text-right" />
    </label>
  );
}

const PRESET_KEYS = ['1F', '2F', '3F', '4F', 'overview'] as const;

export default function FloorControls() {
  const {
    floorNames, focusedFloor, floorMode, setFloorMode,
    focusOnFloor, resetFocus, explodeConfig, setExplodeConfig,
    showConfig, toggleConfig, setCameraPreset, getCameraPreset,
    getCurrentView,
  } = useStore(useShallow((s) => ({
    floorNames: s.floorNames,
    focusedFloor: s.focusedFloor,
    floorMode: s.floorMode,
    setFloorMode: s.setFloorMode,
    focusOnFloor: s.focusOnFloor,
    resetFocus: s.resetFocus,
    explodeConfig: s.explodeConfig,
    setExplodeConfig: s.setExplodeConfig,
    showConfig: s.showConfig,
    toggleConfig: s.toggleConfig,
    setCameraPreset: s.setCameraPreset,
    getCameraPreset: s.getCameraPreset,
    getCurrentView: s._cameraActions.getCurrentView,
  })));

  const setCfg = (p: Partial<ExplodeConfig>) => setExplodeConfig(p);
  const [editPresetKey, setEditPresetKey] = useState<string>('overview');
  const [showCamera, setShowCamera] = useState(false);
  const [locks, setLocks] = useState({ phi: false, theta: false, dist: false });
  const toggleLock = (k: keyof typeof locks) => setLocks((p) => ({ ...p, [k]: !p[k] }));

  // 读取当前视图 — 扩展返回 camOffset/targetOffset 供数字输入使用
  const readView = () => {
    if (!getCurrentView) return { phi: 45, theta: -36, dist: 100, target: [0, 0, 0] as [number, number, number], camOffset: [0, 0, 0] as [number, number, number], targetOffset: [0, 0, 0] as [number, number, number] };
    const gc = useStore.getState().globalCenter;
    const v = getCurrentView([0, 0, 0], 1);
    const cx = gc[0] + v.camOffset[0];
    const cy = gc[1] + v.camOffset[1];
    const cz = gc[2] + v.camOffset[2];
    const tx = gc[0] + v.targetOffset[0];
    const ty = gc[1] + v.targetOffset[1];
    const tz = gc[2] + v.targetOffset[2];
    const dx = cx - tx;
    const dy = cy - ty;
    const dz = cz - tz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return {
      phi: Math.round(Math.asin(dy / dist) * 180 / Math.PI),
      theta: Math.round(Math.atan2(dx, dz) * 180 / Math.PI),
      dist: Math.round(dist),
      target: [tx, ty, tz] as [number, number, number],
      camOffset: v.camOffset,
      targetOffset: v.targetOffset,
    };
  };

  // 直接通过 camOffset 移动相机（数字输入用）
  const moveCameraDirect = (offset: [number, number, number]) => {
    const gc = useStore.getState().globalCenter;
    const v = readView();
    const pos: [number, number, number] = [gc[0] + offset[0], gc[1] + offset[1], gc[2] + offset[2]];
    useStore.getState()._cameraActions.flyTo?.(pos, v.target, 0.3);
  };

  // 直接通过 targetOffset 移动注视点（数字输入用）
  const moveTargetDirect = (offset: [number, number, number]) => {
    const gc = useStore.getState().globalCenter;
    const rv = readView();
    const tgt: [number, number, number] = [gc[0] + offset[0], gc[1] + offset[1], gc[2] + offset[2]];
    useStore.getState()._cameraActions.flyTo?.([gc[0] + rv.camOffset[0], gc[1] + rv.camOffset[1], gc[2] + rv.camOffset[2]], tgt, 0.3);
  };

  const moveCamera = (p: { phi?: number; theta?: number; dist?: number }) => {
    const cur = readView();
    const nPhi = locks.phi ? cur.phi : (p.phi ?? cur.phi);
    const nTheta = locks.theta ? cur.theta : (p.theta ?? cur.theta);
    const nDist = locks.dist ? cur.dist : (p.dist ?? cur.dist);
    const phiRad = nPhi * Math.PI / 180;
    const thetaRad = nTheta * Math.PI / 180;
    const pos: [number, number, number] = [
      cur.target[0] + nDist * Math.cos(phiRad) * Math.sin(thetaRad),
      cur.target[1] + nDist * Math.sin(phiRad),
      cur.target[2] + nDist * Math.cos(phiRad) * Math.cos(thetaRad),
    ];
    useStore.getState()._cameraActions.flyTo?.(pos, cur.target, 0.3);
  };

  const switchPreset = (key: string) => {
    setEditPresetKey(key);
    const p = getCameraPreset(floorMode, key);
    const gc = useStore.getState().globalCenter;
    const camPos: [number, number, number] = [gc[0] + p.camOffset[0], gc[1] + p.camOffset[1], gc[2] + p.camOffset[2]];
    const target: [number, number, number] = [gc[0] + p.targetOffset[0], gc[1] + p.targetOffset[1], gc[2] + p.targetOffset[2]];
    console.log(
      `[3D:DEBUG:CAM:LOAD] ${floorMode}:${key}: cam=(${camPos[0].toFixed(1)},${camPos[1].toFixed(1)},${camPos[2].toFixed(1)}) target=(${target[0].toFixed(1)},${target[1].toFixed(1)},${target[2].toFixed(1)})`
    );
    useStore.getState()._cameraActions.flyTo?.(camPos, target, 1.0);
  };

  const recordCurrentView = () => {
    if (!getCurrentView) return;
    const v = getCurrentView([0, 0, 0], 1);
    setCameraPreset(floorMode, editPresetKey, v);
    const gc = useStore.getState().globalCenter;
    console.log(
      `[3D:DEBUG:CAM:SAVE] 💾 ${floorMode}:${editPresetKey}:\n` +
      `  绝对: cam=(${(gc[0]+v.camOffset[0]).toFixed(1)},${(gc[1]+v.camOffset[1]).toFixed(1)},${(gc[2]+v.camOffset[2]).toFixed(1)}) target=(${(gc[0]+v.targetOffset[0]).toFixed(1)},${(gc[1]+v.targetOffset[1]).toFixed(1)},${(gc[2]+v.targetOffset[2]).toFixed(1)})\n` +
      `  偏移: cam=(${v.camOffset[0].toFixed(1)},${v.camOffset[1].toFixed(1)},${v.camOffset[2].toFixed(1)}) target=(${v.targetOffset[0].toFixed(1)},${v.targetOffset[1].toFixed(1)},${v.targetOffset[2].toFixed(1)})`
    );
  };

  return (
    <div className="absolute left-4 bottom-4 z-[var(--z-dropdown,200)] pointer-events-none">
      <div className="flex flex-col gap-2 pointer-events-auto max-h-[80vh] overflow-y-auto">
        {/* 楼层按钮 */}
        <div className="flex gap-1.5">
          {floorNames.map((name) => (
            <button key={name} onClick={() => focusOnFloor(name)}
              className={FLOOR_BTN(focusedFloor === name)}
              aria-label={`聚焦 ${name}`} aria-pressed={focusedFloor === name}>
              {name}
            </button>
          ))}
          <button onClick={resetFocus}
            className="px-2 py-1.5 rounded-lg text-xs font-bold bg-[var(--app-color-surface-elevated)]/85 backdrop-blur-lg border border-[var(--app-color-border-subtle)]/60 text-[var(--app-color-text-secondary)]"
            aria-label="还原视角">还原</button>
        </div>

        {/* 模式切换 */}
        <div className="flex gap-1.5 items-center">
          <button onClick={() => setFloorMode(floorMode === 'exploded' ? 'stacked' : 'exploded')}
            className={MODE_BTN(floorMode === 'exploded')} aria-pressed={floorMode === 'exploded'}>
            💥 {floorMode === 'exploded' ? '爆炸中' : '爆炸'}
          </button>
          <button onClick={() => setFloorMode(floorMode === 'staircase' ? 'stacked' : 'staircase')}
            className={MODE_BTN(floorMode === 'staircase')} aria-pressed={floorMode === 'staircase'}>
            📶 {floorMode === 'staircase' ? '阶梯中' : '阶梯'}
          </button>
          <button onClick={toggleConfig}
            className={`px-2 py-1 rounded-md text-xs font-bold transition-colors ${
              showConfig ? 'bg-[var(--app-color-accent)] text-white' : 'bg-[var(--app-color-surface-elevated)]/85 text-[var(--app-color-text-secondary)]'}`}
            aria-label="配置" title="间距/镜头配置">⚙</button>
        </div>

        {/* 配置面板 */}
        {showConfig && (
          <div className="bg-[var(--app-color-surface-elevated)]/95 backdrop-blur-md border border-[var(--app-color-border-default)] rounded-xl p-3 flex flex-col gap-3 min-w-[240px] shadow-xl">
            {/* 间距配置 */}
            <div>
              <div className="text-[11px] font-bold text-[var(--app-color-text-primary)] mb-1.5">
                {(floorMode === 'exploded' ? '💥 爆炸' : '📶 阶梯') + '间距'}
              </div>
              <Slider label="垂直间距" value={explodeConfig.gapV} min={0} max={200} step={1}
                onChange={(v) => setCfg({ gapV: v })} unit="dm" />
              {floorMode === 'staircase' && (
                <>
                  <Slider label="阶梯 X" value={explodeConfig.offsetX} min={-100} max={100} step={1}
                    onChange={(v) => setCfg({ offsetX: v })} unit="dm" />
                  <Slider label="阶梯 Z" value={explodeConfig.offsetZ} min={-200} max={200} step={1}
                    onChange={(v) => setCfg({ offsetZ: v })} unit="dm" />
                </>
              )}
            </div>

            <div className="border-t border-[var(--app-color-border-subtle)]/50" />

            {/* 镜头预设 */}
            <div>
              <button onClick={() => setShowCamera(!showCamera)}
                className="text-[11px] font-bold text-[var(--app-color-text-primary)] flex items-center gap-1 w-full text-left">
                🎥 镜头预设 {showCamera ? '▾' : '▸'}
              </button>
              {showCamera && (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex gap-1 flex-wrap">
                    {PRESET_KEYS.map((k) => (
                      <button key={k} onClick={() => switchPreset(k)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                          editPresetKey === k
                            ? 'bg-[var(--app-color-accent)] text-white'
                            : 'bg-[var(--app-color-surface-page)] text-[var(--app-color-text-secondary)]'
                        }`}>
                        {k === 'overview' ? '还原' : k}
                      </button>
                    ))}
                  </div>
                  {/* 当前预设值 */}
                  {(() => {
                    const p = getCameraPreset(floorMode, editPresetKey);
                    const gc = useStore.getState().globalCenter;
                    return (
                      <div className="text-[10px] text-[var(--app-color-text-secondary)] leading-relaxed bg-[var(--app-color-surface-page)] rounded-lg p-1.5">
                        <div className="font-bold text-[var(--app-color-text-primary)] mb-0.5">{editPresetKey === 'overview' ? '还原' : editPresetKey} 已保存 ({floorMode}):</div>
                        <div>cam=({(gc[0]+p.camOffset[0]).toFixed(0)},{(gc[1]+p.camOffset[1]).toFixed(0)},{(gc[2]+p.camOffset[2]).toFixed(0)})</div>
                        <div>target=({(gc[0]+p.targetOffset[0]).toFixed(0)},{(gc[1]+p.targetOffset[1]).toFixed(0)},{(gc[2]+p.targetOffset[2]).toFixed(0)})</div>
                      </div>
                    );
                  })()}
                  {/* 6 值精确编辑 + 球坐标粗调 */}
                  {(() => {
                    const v = readView();
                    return (
                      <>
                        {/* camOffset 数字输入 */}
                        <div className="text-[10px] font-bold text-[var(--app-color-text-primary)]">相机位置 (camOffset)</div>
                        <div className="flex gap-1">
                          <NumberInput label="X" value={Math.round(v.camOffset[0])} onChange={(val) => moveCameraDirect([val, v.camOffset[1], v.camOffset[2]])} />
                          <NumberInput label="Y" value={Math.round(v.camOffset[1])} onChange={(val) => moveCameraDirect([v.camOffset[0], val, v.camOffset[2]])} />
                          <NumberInput label="Z" value={Math.round(v.camOffset[2])} onChange={(val) => moveCameraDirect([v.camOffset[0], v.camOffset[1], val])} />
                        </div>

                        {/* targetOffset 数字输入 */}
                        <div className="text-[10px] font-bold text-[var(--app-color-text-primary)]">注视目标 (targetOffset)</div>
                        <div className="flex gap-1">
                          <NumberInput label="X" value={Math.round(v.targetOffset[0])} onChange={(val) => moveTargetDirect([val, v.targetOffset[1], v.targetOffset[2]])} />
                          <NumberInput label="Y" value={Math.round(v.targetOffset[1])} onChange={(val) => moveTargetDirect([v.targetOffset[0], val, v.targetOffset[2]])} />
                          <NumberInput label="Z" value={Math.round(v.targetOffset[2])} onChange={(val) => moveTargetDirect([v.targetOffset[0], v.targetOffset[1], val])} />
                        </div>

                        {/* 球坐标滑块（快速粗调） */}
                        <div className="text-[10px] font-bold text-[var(--app-color-text-secondary)] mt-1">球坐标粗调</div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => toggleLock('phi')}
                            className={`text-[10px] w-5 h-4 rounded ${locks.phi ? 'bg-red-500/20' : 'opacity-30'}`}>
                            {locks.phi ? '🔒' : '🔓'}</button>
                          <Slider label="仰角" value={v.phi} min={5} max={85} step={1}
                            onChange={(val) => moveCamera({ phi: val })} unit="°" />
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => toggleLock('theta')}
                            className={`text-[10px] w-5 h-4 rounded ${locks.theta ? 'bg-red-500/20' : 'opacity-30'}`}>
                            {locks.theta ? '🔒' : '🔓'}</button>
                          <Slider label="方位" value={v.theta} min={-90} max={90} step={1}
                            onChange={(val) => moveCamera({ theta: val })} unit="°" />
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => toggleLock('dist')}
                            className={`text-[10px] w-5 h-4 rounded ${locks.dist ? 'bg-red-500/20' : 'opacity-30'}`}>
                            {locks.dist ? '🔒' : '🔓'}</button>
                          <Slider label="距离" value={v.dist} min={5} max={500} step={1}
                            onChange={(val) => moveCamera({ dist: val })} unit="m" />
                        </div>
                      </>
                    );
                  })()}

                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={recordCurrentView}
                      className="px-2 py-1 rounded text-[10px] font-bold bg-[var(--app-color-accent)]/20 text-[var(--app-color-accent)] hover:bg-[var(--app-color-accent)]/30 transition-colors">
                      📷 记录
                    </button>
                    <button onClick={() => {
                      const p = getCameraPreset(floorMode, editPresetKey);
                      PRESET_KEYS.filter(k => k !== 'overview' && k !== editPresetKey).forEach(k => setCameraPreset(floorMode, k, p));
                    }}
                      className="px-2 py-1 rounded text-[10px] font-bold bg-[var(--app-color-surface-page)] text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-text-primary)] transition-colors">
                      套用到全部楼层
                    </button>
                  </div>
                  <div className="text-[9px] text-[var(--app-color-text-secondary)]/50">
                    滑块调节实时预览 · 🔒锁定 · 📷存原始坐标不漂移
                  </div>
                </div>
              )}
            </div>

            <div className="text-[10px] text-[var(--app-color-text-secondary)]/60">
              所有配置自动保存到浏览器。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
