import { useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';

export default function CameraController() {
  const { camera, gl } = useThree();
  const controlsRef = useRef<any>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  // 使用 useShallow 避免每次创建新对象导致重渲染
  const { fov, floors, floorNames } = useStore(
    useShallow((s) => ({ fov: s.fov, floors: s.floors, floorNames: s.floorNames })),
  );

  // GSAP 运镜: fly-to preset
  const flyTo = (pos: [number, number, number], target: [number, number, number], duration = 1.2) => {
    timelineRef.current?.kill();
    if (!controlsRef.current) return;
    const tl = gsap.timeline();
    tl.to(camera.position, { x: pos[0], y: pos[1], z: pos[2], duration, ease: 'power2.inOut' }, 0);
    tl.to(controlsRef.current.target, { x: target[0], y: target[1], z: target[2], duration, ease: 'power2.inOut', onUpdate: () => controlsRef.current?.update() }, 0);
    timelineRef.current = tl;
  };

  // 暴露 flyTo 到全局 (UI 面板调用)
  (window as any).__dt3d_flyTo = flyTo;

  // 全局复位: 计算所有已加载楼层的包围球
  (window as any).__dt3d_resetCamera = () => {
    const loaded = Object.values(floors).filter((f) => f.loaded);
    if (loaded.length === 0) { flyTo([30, 16, 30], [0, 8, 0]); return; }
    let cx = 0, cy = 0, cz = 0, maxR = 0;
    loaded.forEach((f) => { cx += f.center[0]; cy += f.center[1]; cz += f.center[2]; maxR = Math.max(maxR, f.radius); });
    const n = loaded.length;
    const globalCenter: [number, number, number] = [cx / n, cy / n, cz / n];
    const dist = maxR * 1.5 / Math.sin((fov * Math.PI) / 180 / 2);
    const phi = Math.PI / 6;
    const theta = -Math.PI / 3;
    flyTo(
      [globalCenter[0] + dist * Math.cos(phi) * Math.sin(theta), globalCenter[1] + dist * Math.sin(phi), globalCenter[2] + dist * Math.cos(phi) * Math.cos(theta)],
      globalCenter,
    );
  };

  // 楼层聚焦
  (window as any).__dt3d_focusFloor = (name: string) => {
    const f = floors[name];
    if (!f?.loaded) return;
    const fovRad = (fov * Math.PI) / 180;
    const dist = (f.radius / Math.sin(fovRad / 2)) * 0.8;
    flyTo(
      [f.center[0], f.center[1] + dist * 0.55, f.center[2] + dist * 0.65],
      f.center,
    );
  };

  // useGSAP 自动 cleanup + visibilitychange 暂停/恢复 + 全局函数清理
  useGSAP(() => {
    const onVisibility = () => {
      if (document.hidden) { gsap.globalTimeline.pause(); timelineRef.current?.pause(); }
      else { gsap.globalTimeline.resume(); timelineRef.current?.resume(); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      timelineRef.current?.kill();
      document.removeEventListener('visibilitychange', onVisibility);
      delete (window as any).__dt3d_flyTo;
      delete (window as any).__dt3d_resetCamera;
      delete (window as any).__dt3d_focusFloor;
    };
  }, []);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping dampingFactor={0.08}
      minDistance={6} maxDistance={80}
      minPolarAngle={0.15} maxPolarAngle={1.35}
      zoomSpeed={0.8} rotateSpeed={0.5}
    />
  );
}
