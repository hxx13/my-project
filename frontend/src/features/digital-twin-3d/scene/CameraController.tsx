import { useRef, useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import type { CameraPreset } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';

// P2.9: prefers-reduced-motion 检测（模块顶层，避免重复查询）
const prefersReducedMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 🔧 计算覆盖包围球所需的相机距离（含 padding） */
function fitDistance(radius: number, fovRad: number, padding = 1.4): number {
  return (radius * padding) / Math.tan(fovRad / 2);
}

/** 🔧 计算俯瞰视角的相机位置（phi=仰角, theta=水平角） */
function orbitPos(
  target: [number, number, number],
  distance: number,
  phi: number,
  theta: number,
): [number, number, number] {
  return [
    target[0] + distance * Math.cos(phi) * Math.sin(theta),
    target[1] + distance * Math.sin(phi),
    target[2] + distance * Math.cos(phi) * Math.cos(theta),
  ];
}

/** 🔧 DEBUG: 输出相机状态 */
function debugCamera(label: string, pos: THREE.Vector3, target: THREE.Vector3, fov: number, globalCenter: number[], globalRadius: number) {
  const distToTarget = pos.distanceTo(target);
  const distToCenter = pos.distanceTo(new THREE.Vector3(...globalCenter));
  console.log(
    `[3D:DEBUG:CAM] ${label}:\n` +
    `  cameraPos  = (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})\n` +
    `  target     = (${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)})\n` +
    `  dist→target = ${distToTarget.toFixed(1)}, dist→globalCenter = ${distToCenter.toFixed(1)}\n` +
    `  fov = ${fov.toFixed(1)}°, globalCenter = (${globalCenter[0].toFixed(1)}, ${globalCenter[1].toFixed(1)}, ${globalCenter[2].toFixed(1)}), globalRadius = ${globalRadius.toFixed(1)}`
  );
}

export default function CameraController() {
  const { camera, gl } = useThree();
  const controlsRef = useRef<any>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const animatingRef = useRef(false); // P2.4: 动画期间跳过 globalCenter Effect 的 target 覆写
  // 稳定的 target Vector3，仅在 globalCenter 变化时更新
  const targetRef = useRef(new THREE.Vector3(0, 4, 0));
  // 首次自动俯瞰是否完成
  const [initialFlyDone, setInitialFlyDone] = useState(false);

  const { fov, floors, floorNames, globalCenter, globalRadius, effectiveSpacing } = useStore(
    useShallow((s) => ({
      fov: s.fov,
      floors: s.floors,
      floorNames: s.floorNames,
      globalCenter: s.globalCenter,
      globalRadius: s.globalRadius,
      effectiveSpacing: s.effectiveSpacing,
    })),
  );

  // globalCenter 变化时同步更新 target ref（动画期间跳过，避免覆盖 GSAP tween）
  useEffect(() => {
    targetRef.current.set(globalCenter[0], globalCenter[1], globalCenter[2]);
    if (controlsRef.current && !animatingRef.current) {
      controlsRef.current.target.copy(targetRef.current);
      controlsRef.current.update();
    }
  }, [globalCenter]);

  // Step 1.4: fov 同步 — useEffect 单向 + 阈值守卫
  useEffect(() => {
    const storeFov = useStore.getState().fov;
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    if (Math.abs(perspectiveCamera.fov - storeFov) > 0.01) {
      useStore.setState({ fov: perspectiveCamera.fov });
    }
  }, [camera]);

  // GSAP 运镜底层: fly-to。P2.9: reduced-motion → duration=0
  const flyTo = (pos: [number, number, number], target: [number, number, number], duration = 1.2) => {
    timelineRef.current?.kill();
    if (!controlsRef.current) return;
    animatingRef.current = true;
    const actualDuration = prefersReducedMotion ? 0 : duration;
    const tl = gsap.timeline({
      onComplete: () => { animatingRef.current = false; },
    });
    tl.to(camera.position, { x: pos[0], y: pos[1], z: pos[2], duration: actualDuration, ease: 'power2.inOut' }, 0);
    tl.to(controlsRef.current.target, {
      x: target[0], y: target[1], z: target[2],
      duration: actualDuration, ease: 'power2.inOut',
      onUpdate: () => controlsRef.current?.update(),
    }, 0);
    timelineRef.current = tl;

    // 🔧 DEBUG
    debugCamera(
      `flyTo → ${pos.map(v=>v.toFixed(1)).join(',')}`,
      new THREE.Vector3(...pos), new THREE.Vector3(...target),
      useStore.getState().fov, globalCenter, globalRadius,
    );
  };

  /**
   * P3: 核心聚焦函数 — 计算覆盖指定包围球的最佳相机位。
   * 所有聚焦操作（全局、楼层、房间）都复用此函数。
   *
   * @param center 世界空间包围球中心
   * @param radius 包围球半径
   * @param phi    仰角（弧度），默认 30° ≈ 0.524
   * @param theta  水平方位角（弧度），默认 -45° ≈ -0.785
   */
  const focusTarget = (
    center: [number, number, number],
    radius: number,
    phi = Math.PI / 6,
    theta = -Math.PI / 4,
    padding = 1.4,
    offsetX = 0,
    offsetY = 0,
    offsetZ = 0,
  ) => {
    const latestFov = useStore.getState().fov;
    const fovRad = (latestFov * Math.PI) / 180;
    const dist = fitDistance(radius, fovRad, padding);
    const shiftedCenter: [number, number, number] = [
      center[0] + offsetX,
      center[1] + offsetY,
      center[2] + offsetZ,
    ];
    const pos = orbitPos(shiftedCenter, dist, phi, theta);
    flyTo(pos, shiftedCenter);
  };

  /** P3 示教器: 记录相机相对 globalCenter 的偏移 */
  const getCurrentView = (_center: [number, number, number], _radius: number): CameraPreset => {
    const t = controlsRef.current?.target as THREE.Vector3 | undefined;
    if (!t) console.warn('[3D:CAM] getCurrentView: controlsRef.current?.target is null — targetOffset defaults to [0,0,0]');
    const gc = useStore.getState().globalCenter;
    const result: CameraPreset = {
      camOffset: [camera.position.x - gc[0], camera.position.y - gc[1], camera.position.z - gc[2]],
      targetOffset: t ? [t.x - gc[0], t.y - gc[1], t.z - gc[2]] : [0, 0, 0],
    };
    console.log(
      `[3D:DEBUG:CAM:VIEW] 偏移: cam=(${result.camOffset[0].toFixed(1)},${result.camOffset[1].toFixed(1)},${result.camOffset[2].toFixed(1)}) target=(${result.targetOffset[0].toFixed(1)},${result.targetOffset[1].toFixed(1)},${result.targetOffset[2].toFixed(1)})`
    );
    return result;
  };

  // 全局复位: 基于当前 globalCenter + 偏移重建
  const resetCamera = () => {
    const state = useStore.getState();
    const preset = state.getCameraPreset(state.floorMode, 'overview');
    const gc = state.globalCenter;
    flyTo(
      [gc[0] + preset.camOffset[0], gc[1] + preset.camOffset[1], gc[2] + preset.camOffset[2]],
      [gc[0] + preset.targetOffset[0], gc[1] + preset.targetOffset[1], gc[2] + preset.targetOffset[2]],
    );
  };

  // 楼层聚焦: 基于当前 globalCenter + 偏移重建
  // 注意：聚焦布局将目标楼层放在 targetY=0（与 stacked 模式一致），
  // 因此始终使用 'stacked' 模式的镜头预设，而非当前 floorMode
  const focusFloor = (name: string) => {
    const state = useStore.getState();
    const f = state.floors[name];
    if (!f?.loaded) {
      console.warn(`[3D] Cannot focus ${name}: not loaded yet`);
      return;
    }
    const preset = state.getCameraPreset('stacked', name);
    const gc = state.globalCenter;
    flyTo(
      [gc[0] + preset.camOffset[0], gc[1] + preset.camOffset[1], gc[2] + preset.camOffset[2]],
      [gc[0] + preset.targetOffset[0], gc[1] + preset.targetOffset[1], gc[2] + preset.targetOffset[2]],
    );
  };

  // P3 fix: 用 ref 保持所有 action 函数引用始终指向最新渲染版本
  // 避免 useGSAP([]) 空依赖导致的陈旧闭包问题
  const actionsRef = useRef({ flyTo, resetCamera, focusFloor, focusTarget, getCurrentView });
  actionsRef.current = { flyTo, resetCamera, focusFloor, focusTarget, getCurrentView };

  // P0.2: 注册 _cameraActions 到 store（稳定 wrapper 通过 ref 委托到最新实现）
  useGSAP(() => {
    useStore.setState({
      _cameraActions: {
        flyTo: ((...args: Parameters<typeof flyTo>) => actionsRef.current.flyTo(...args)) as typeof flyTo,
        resetCamera: () => actionsRef.current.resetCamera(),
        focusFloor: (name: string) => actionsRef.current.focusFloor(name),
        focusTarget: ((...args: Parameters<typeof focusTarget>) => actionsRef.current.focusTarget(...args)) as typeof focusTarget,
        getCurrentView: (center: [number,number,number], radius: number) => actionsRef.current.getCurrentView(center, radius),
        killAnimation: () => { timelineRef.current?.kill(); animatingRef.current = false; },
      },
    });

    // Step 2.6: visibilitychange 暂停/恢复
    const onVisibility = () => {
      if (document.hidden) {
        timelineRef.current?.pause();
      } else {
        timelineRef.current?.resume();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      timelineRef.current?.kill();
      animatingRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      useStore.setState({
        _cameraActions: { flyTo: null, resetCamera: null, focusFloor: null, focusTarget: null, getCurrentView: null, killAnimation: null },
      });
    };
  }, []);

  // P3: 首次加载 — 有保存的 overview 预设则飞到，没有则不动
  const loadedCount = Object.values(floors).filter((f) => f.loaded).length;
  useEffect(() => {
    if (!initialFlyDone && loadedCount >= floorNames.length && floorNames.length > 0) {
      setInitialFlyDone(true);
      const state = useStore.getState();
      const preset = state.getCameraPreset(state.floorMode, 'overview');
      // P2.1: 同时检查 camOffset 和 targetOffset（6 值全比对），避免误判
      const isDefault =
        preset.camOffset[0] === 0 && preset.camOffset[1] === 30 && preset.camOffset[2] === 60 &&
        preset.targetOffset[0] === 0 && preset.targetOffset[1] === 8 && preset.targetOffset[2] === 0;
      if (!isDefault) {
        const gc = state.globalCenter;
        flyTo(
          [gc[0] + preset.camOffset[0], gc[1] + preset.camOffset[1], gc[2] + preset.camOffset[2]],
          [gc[0] + preset.targetOffset[0], gc[1] + preset.targetOffset[1], gc[2] + preset.targetOffset[2]],
          1.5,
        );
      }
    }
  }, [loadedCount, floorNames.length]);

  // Step 2.1: 动态距离约束
  // P3: maxDistance 需容纳俯瞰距离 (globalRadius * 1.4 / tan(fov/2) ≈ radius * 3.6)
  const minDist = Math.max(1, globalRadius * 0.3);
  const maxDist = Math.max(minDist + 1, globalRadius * 6.0);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={targetRef.current}
      enableDamping dampingFactor={0.08}
      minDistance={minDist}
      maxDistance={maxDist}
      minPolarAngle={0.05}
      maxPolarAngle={1.55}
      zoomSpeed={0.8}
      rotateSpeed={0.5}
      enablePan
      panSpeed={0.8}
      mouseButtons={{ LEFT: 0, MIDDLE: 2, RIGHT: 2 }}
    />
  );
}
