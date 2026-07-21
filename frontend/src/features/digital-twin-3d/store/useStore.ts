import { create } from 'zustand';

export type FloorData = {
  name: string;
  loaded: boolean;
  center: [number, number, number];
  radius: number;
};

export type SelectedNode = {
  name: string;
  type: 'Room' | 'Door' | 'Device';
  worldPos: [number, number, number];
};

export type DeviceTier = 'high' | 'medium' | 'low';

type Store = {
  // 设备
  deviceTier: DeviceTier;
  // 楼层（当前 3 层占位，后续扩展 FLOOR_NAMES）
  floorNames: string[];
  floors: Record<string, FloorData>;
  registerFloor: (name: string, center: [number, number, number], radius: number) => void;
  // 材质共享注册表
  materialCache: Map<string, THREE.Material>;
  registerSharedMaterial: (name: string, mat: THREE.Material) => void;
  // 楼层模式
  floorMode: 'stacked' | 'exploded' | 'staircase';
  setFloorMode: (mode: 'stacked' | 'exploded' | 'staircase') => void;
  focusedFloor: string | null;
  setFocusedFloor: (name: string | null) => void;
  explodeGapV: number;
  explodeGapH: number;
  setExplodeGap: (v: number, h: number) => void;
  // 摄像机
  fov: number;
  cameraTarget: [number, number, number];
  setCameraTarget: (t: [number, number, number]) => void;
  // 选中
  selectedNode: SelectedNode | null;
  setSelectedNode: (n: SelectedNode | null) => void;
  // 巡航
  isTouring: boolean;
  tourStyle: 'orbit' | 'hero';
  startTour: () => void;
  stopTour: () => void;
};

const FLOOR_NAMES = ['2F', '3F', '4F']; // 当前占位，后续替换为 1F-8F

// 设备档位同步检测（模块顶层，React 渲染前执行，避免 useEffect 竞态）
function detectTier(): DeviceTier {
  const cores = navigator.hardwareConcurrency ?? 4;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const maxTex = gl?.getParameter(gl.MAX_TEXTURE_SIZE) ?? 4096;
  canvas.remove(); // 不泄漏 DOM
  if (cores < 4 || maxTex < 4096) return 'low';
  if (cores < 7) return 'medium';
  return 'high';
}
const INITIAL_TIER = detectTier();

export const useStore = create<Store>((set, get) => ({
  deviceTier: INITIAL_TIER,
  floorNames: FLOOR_NAMES,
  floors: {},
  registerFloor: (name, center, radius) =>
    set((s) => ({ floors: { ...s.floors, [name]: { name, loaded: true, center, radius } } })),

  materialCache: new Map(),
  registerSharedMaterial: (name, mat) =>
    set((s) => { const m = new Map(s.materialCache); m.set(name, mat); return { materialCache: m }; }),

  floorMode: 'stacked',
  setFloorMode: (mode) => set({ floorMode: mode, focusedFloor: null }),
  focusedFloor: null,
  setFocusedFloor: (name) => set({ focusedFloor: name, floorMode: 'stacked' }),
  explodeGapV: 16,
  explodeGapH: 40,
  setExplodeGap: (v, h) => set({ explodeGapV: v, explodeGapH: h }),

  fov: 42,
  cameraTarget: [0, 8, 0],
  setCameraTarget: (t) => set({ cameraTarget: t }),

  selectedNode: null,
  setSelectedNode: (n) => set({ selectedNode: n }),

  isTouring: false,
  tourStyle: 'orbit',
  startTour: () => set({ isTouring: true }),
  stopTour: () => set({ isTouring: false }),
}));
