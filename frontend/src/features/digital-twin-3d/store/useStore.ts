import { create } from 'zustand';
import * as THREE from 'three';

export type FloorData = {
  name: string;
  loaded: boolean;
  /** GLB 本地空间包围盒中心（未经任何 Y 偏移） */
  localCenter: [number, number, number];
  radius: number;
  /** 模型包围盒 Y 轴高度（用于自动计算楼层间距） */
  height: number;
};

export type SelectedNode = {
  name: string;
  type: 'Room' | 'Door' | 'Device';
  /** 所在楼层名 */
  floorName: string;
  /** 点击时 mesh 中心在 Group 本地空间的位置（不含 group.position 偏移） */
  localX: number;
  localZ: number;
  /** 当前世界坐标（由 BuildingModel useGSAP 动态更新 = groupPos + local） */
  worldPos: [number, number, number];
};

/** 屏幕浮窗投影坐标（Canvas 内 useFrame 更新） */
export type ScreenProjection = {
  x: number;
  y: number;
  visible: boolean; // 目标在屏幕内则为 true
};

export type DeviceTier = 'high' | 'medium' | 'low';

/** CameraController 挂载时注册的运镜函数，面板通过 store 调用替代 window.__dt3d_* */
export type CameraActions = {
  flyTo: ((pos: [number, number, number], target: [number, number, number], duration?: number) => void) | null;
  resetCamera: (() => void) | null;
  focusFloor: ((name: string) => void) | null;
  /** P3: 聚焦任意包围球（房间/设备/全局通用） */
  focusTarget: ((center: [number, number, number], radius: number, phi?: number, theta?: number, padding?: number, offsetX?: number, offsetY?: number, offsetZ?: number) => void) | null;
  /** P3 示教器: 读取当前相机位姿 */
  getCurrentView: ((center: [number, number, number], radius: number) => CameraPreset) | null;
  killAnimation: (() => void) | null;
};

/** 爆炸/阶梯视图可配置参数 */
export type ExplodeConfig = {
  gapV: number;   // 垂直额外间距 (0-200, 默认 16)
  offsetX: number; // 阶梯 X 偏移 (-100~100, 默认 0)
  offsetZ: number; // 阶梯 Z 偏移 (-200~200, 默认 -40)
};

/** 镜头预设：存储相对于 globalCenter 的偏移，加载时基于当前模型位置重建 */
export type CameraPreset = {
  /** 相机位置 = globalCenter + camOffset */
  camOffset: [number, number, number];
  /** 注视目标 = globalCenter + targetOffset */
  targetOffset: [number, number, number];
};

export type FloorMode = 'stacked' | 'exploded' | 'staircase';

/** 所有镜头预设：按楼层模式分层，每个模式拥有独立的 floors + overview */
export type CameraPresets = Record<FloorMode, {
  floors: Record<string, CameraPreset>;
  overview: CameraPreset;
}>;

const LS_EXPLODE = 'dt3d-explode-config';
const LS_CAMERA = 'dt3d-camera-presets';
const LS_FLOOR_MODE = 'dt3d-floor-mode';

const DEFAULT_FLOOR_PRESET: CameraPreset = { camOffset: [0, 8, 15], targetOffset: [0, 2, 0] };
const DEFAULT_OVERVIEW: CameraPreset = { camOffset: [0, 30, 60], targetOffset: [0, 8, 0] };

const DEFAULT_PRESETS: CameraPresets = {
  stacked:   { floors: {}, overview: { ...DEFAULT_OVERVIEW } },
  exploded:  { floors: {}, overview: { ...DEFAULT_OVERVIEW } },
  staircase: { floors: {}, overview: { ...DEFAULT_OVERVIEW } },
};

function loadConfig(): ExplodeConfig {
  try { const raw = localStorage.getItem(LS_EXPLODE); if (raw) return JSON.parse(raw); } catch { /* */ }
  return { gapV: 16, offsetX: 0, offsetZ: -40 };
}
function saveConfig(c: ExplodeConfig) {
  try { localStorage.setItem(LS_EXPLODE, JSON.stringify(c)); } catch { /* */ }
}

function loadFloorMode(): FloorMode {
  try {
    const raw = localStorage.getItem(LS_FLOOR_MODE);
    if (raw === 'exploded' || raw === 'staircase' || raw === 'stacked') return raw;
  } catch { /* */ }
  return 'stacked';
}
function saveFloorMode(m: FloorMode) {
  try { localStorage.setItem(LS_FLOOR_MODE, m); } catch { /* */ }
}

function loadCameraPresets(): CameraPresets {
  try {
    const raw = localStorage.getItem(LS_CAMERA);
    if (raw) {
      const p = JSON.parse(raw);
      // 迁移旧格式 → 新格式：旧格式无 mode 键（stacked/exploded/staircase）
      if (!p.stacked && !p.exploded && !p.staircase) {
        return {
          stacked:   { floors: p.floors || {}, overview: p.overview || DEFAULT_OVERVIEW },
          exploded:  { floors: {}, overview: { ...DEFAULT_OVERVIEW } },
          staircase: { floors: {}, overview: { ...DEFAULT_OVERVIEW } },
        };
      }
      // 新格式：直接使用，补全缺失的模式
      for (const m of ['stacked', 'exploded', 'staircase'] as FloorMode[]) {
        if (!p[m]) p[m] = { floors: {}, overview: { ...DEFAULT_OVERVIEW } };
      }
      return p;
    }
  } catch { /* */ }
  return {
    stacked:   { floors: {}, overview: { ...DEFAULT_OVERVIEW } },
    exploded:  { floors: {}, overview: { ...DEFAULT_OVERVIEW } },
    staircase: { floors: {}, overview: { ...DEFAULT_OVERVIEW } },
  };
}
function saveCameraPresets(p: CameraPresets) {
  try { localStorage.setItem(LS_CAMERA, JSON.stringify(p)); } catch { /* */ }
}

type Store = {
  // 设备
  deviceTier: DeviceTier;
  // 楼层
  floorNames: string[];
  floors: Record<string, FloorData>;
  registerFloor: (name: string, localCenter: [number, number, number], radius: number, height: number) => void;
  // 材质共享注册表
  materialCache: Map<string, THREE.Material>;
  registerSharedMaterial: (name: string, mat: THREE.Material) => void;
  // 楼层模式
  floorMode: FloorMode;
  setFloorMode: (mode: FloorMode) => void;
  focusedFloor: string | null;
  focusOnFloor: (name: string) => boolean;
  resetFocus: () => void;
  // 爆炸/阶梯配置
  explodeConfig: ExplodeConfig;
  setExplodeConfig: (c: Partial<ExplodeConfig>) => void;
  // 镜头预设
  cameraPresets: CameraPresets;
  setCameraPreset: (mode: FloorMode, key: string, preset: CameraPreset) => void;
  getCameraPreset: (mode: FloorMode, key: string) => CameraPreset;
  // 摄像机
  fov: number;
  cameraTarget: [number, number, number];
  setCameraTarget: (t: [number, number, number]) => void;
  // 选中
  selectedNode: SelectedNode | null;
  setSelectedNode: (n: SelectedNode | null) => void;
  updateSelectedWorldPos: (worldPos: [number, number, number]) => void;
  /** 清除高亮回调（BuildingModel 注册） */
  _clearHighlight: (() => void) | null;
  /** 屏幕投影坐标（Canvas 内 CardTracker 每帧更新） */
  screenProjection: ScreenProjection | null;
  setScreenProjection: (p: ScreenProjection | null) => void;
  // 巡航
  isTouring: boolean;
  tourStyle: 'orbit' | 'hero';
  startTour: () => boolean;
  stopTour: () => void;
  // 运镜 actions
  _cameraActions: CameraActions;
  // 全局包围球
  globalCenter: [number, number, number];
  globalRadius: number;
  effectiveSpacing: number;
  recomputeGlobalBounds: () => void;
  // 配置面板显隐
  showConfig: boolean;
  toggleConfig: () => void;
};

const FLOOR_NAMES = ['1F', '2F', '3F', '4F'];

function detectTier(): DeviceTier {
  if (typeof document === 'undefined') return 'high';
  const cores = navigator.hardwareConcurrency ?? 4;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const maxTex = gl?.getParameter(gl.MAX_TEXTURE_SIZE) ?? 4096;
  canvas.remove();
  if (cores < 4 || maxTex < 4096) return 'low';
  if (cores < 7) return 'medium';
  return 'high';
}
const INITIAL_TIER = detectTier();
const INITIAL_CONFIG = loadConfig();
const INITIAL_FLOOR_MODE = loadFloorMode();
const INITIAL_CAMERA_PRESETS = loadCameraPresets();

export const useStore = create<Store>((set, get) => ({
  deviceTier: INITIAL_TIER,
  floorNames: FLOOR_NAMES,
  floors: {},
  registerFloor: (name, localCenter, radius, height) => {
    set((s) => ({ floors: { ...s.floors, [name]: { name, loaded: true, localCenter, radius, height } } }));
    get().recomputeGlobalBounds();
  },

  materialCache: new Map(),
  registerSharedMaterial: (name, mat) =>
    set((s) => { const m = new Map(s.materialCache); m.set(name, mat); return { materialCache: m }; }),

  floorMode: INITIAL_FLOOR_MODE,
  setFloorMode: (mode) => {
    saveFloorMode(mode);
    set({ floorMode: mode, focusedFloor: null });
  },
  focusedFloor: null,

  focusOnFloor: (name) => {
    const f = get().floors[name];
    if (f?.loaded) {
      get()._clearHighlight?.();
      // P0.4: 保持当前 floorMode，不再强制切回 stacked
      set({ focusedFloor: name, selectedNode: null });
      requestAnimationFrame(() => {
        get()._cameraActions.focusFloor?.(name);
      });
      return true;
    }
    console.log(`[3D] focusOnFloor: ${name} not loaded yet, waiting...`);
    let attempts = 0;
    const maxAttempts = 100;
    const poll = setInterval(() => {
      attempts++;
      const ff = get().floors[name];
      if (ff?.loaded) {
        clearInterval(poll);
        get()._clearHighlight?.();
        // P0.4: 保持当前 floorMode
        set({ focusedFloor: name, selectedNode: null });
        requestAnimationFrame(() => {
          get()._cameraActions.focusFloor?.(name);
        });
      } else if (attempts >= maxAttempts) {
        clearInterval(poll);
        console.warn(`[3D] focusOnFloor: ${name} load timeout`);
      }
    }, 100);
    return false;
  },

  resetFocus: () => {
    set({ focusedFloor: null });
    get()._cameraActions.resetCamera?.();
  },

  explodeConfig: INITIAL_CONFIG,
  setExplodeConfig: (partial) => {
    set((s) => {
      const next = { ...s.explodeConfig, ...partial };
      saveConfig(next);
      return { explodeConfig: next };
    });
  },

  cameraPresets: INITIAL_CAMERA_PRESETS,
  setCameraPreset: (mode, key, preset) => {
    set((s) => {
      const next = {
        ...s.cameraPresets,
        [mode]: {
          floors: { ...s.cameraPresets[mode].floors, [key]: preset },
          overview: key === 'overview' ? preset : s.cameraPresets[mode].overview,
        },
      };
      saveCameraPresets(next);
      return { cameraPresets: next };
    });
  },
  getCameraPreset: (mode, key) => {
    const { cameraPresets } = get();
    const modePresets = cameraPresets[mode] || cameraPresets.stacked;
    if (key === 'overview') return modePresets.overview || DEFAULT_OVERVIEW;
    return modePresets.floors[key] || DEFAULT_FLOOR_PRESET;
  },

  fov: 42,
  cameraTarget: [0, 8, 0],
  setCameraTarget: (t) => set({ cameraTarget: t }),

  selectedNode: null,
  setSelectedNode: (n) => {
    if (n === null) get()._clearHighlight?.();
    set({ selectedNode: n });
  },
  _clearHighlight: null,
  updateSelectedWorldPos: (worldPos) => set((s) => {
    if (!s.selectedNode) return {};
    return { selectedNode: { ...s.selectedNode, worldPos } };
  }),
  screenProjection: null,
  setScreenProjection: (p) => set({ screenProjection: p }),

  isTouring: false,
  tourStyle: 'orbit',
  startTour: () => {
    if (get().isTouring) return false;
    set({ isTouring: true });
    return true;
  },
  stopTour: () => set({ isTouring: false }),

  _cameraActions: { flyTo: null, resetCamera: null, focusFloor: null, focusTarget: null, getCurrentView: null, killAnimation: null },

  globalCenter: [0, 4, 0],
  globalRadius: 12,
  effectiveSpacing: 3.2,
  recomputeGlobalBounds: () => {
    const { floors, floorNames } = get();
    const loaded = Object.values(floors).filter((f) => f.loaded);
    if (loaded.length === 0) {
      set({ globalCenter: [0, 4, 0], globalRadius: 12, effectiveSpacing: 3.2 });
      return;
    }
    const heights = loaded.map((f) => f.height).filter((h) => h > 0);
    const spacing = heights.length > 0 ? Math.max(...heights) : 3.2;
    const n = loaded.length;

    const avgLocalX = loaded.reduce((s, f) => s + f.localCenter[0], 0) / n;
    const avgLocalZ = loaded.reduce((s, f) => s + f.localCenter[2], 0) / n;

    let sumWX = 0, sumWY = 0, sumWZ = 0;
    loaded.forEach((f) => {
      sumWX += f.localCenter[0] - avgLocalX;
      sumWY += f.localCenter[1];
      sumWZ += f.localCenter[2] - avgLocalZ;
    });
    const globalCX = sumWX / n;
    const globalCY = sumWY / n;
    const globalCZ = sumWZ / n;

    let maxR = 0;
    loaded.forEach((f) => {
      const worldX = f.localCenter[0] - avgLocalX;
      const worldY = f.localCenter[1];
      const worldZ = f.localCenter[2] - avgLocalZ;
      const distToCenter = Math.sqrt(
        (worldX - globalCX) ** 2 + (worldY - globalCY) ** 2 + (worldZ - globalCZ) ** 2,
      );
      maxR = Math.max(maxR, f.radius + distToCenter);
    });

    console.log(
      `[3D:DEBUG] globalCenter=(${globalCX.toFixed(2)},${globalCY.toFixed(2)},${globalCZ.toFixed(2)}) radius=${maxR.toFixed(1)} spacing=${spacing.toFixed(2)}`
    );

    set({
      globalCenter: [globalCX, globalCY, globalCZ],
      globalRadius: Math.max(maxR, 12),
      effectiveSpacing: spacing,
    });
  },

  showConfig: false,
  toggleConfig: () => set((s) => ({ showConfig: !s.showConfig })),
}));
