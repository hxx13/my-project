import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky, ContactShadows, useProgress } from '@react-three/drei';
import BuildingModel from './BuildingModel';
import CameraController from './CameraController';
import Lights from './Lights';

/** 加载进度浮层 */
function LoadOverlay() {
  const { active, progress } = useProgress();
  const [done, setDone] = useState(false);

  if (!active && progress === 100 && !done) {
    // 延迟一帧 unmount，防止闪烁
    requestAnimationFrame(() => setDone(true));
  }

  if (done) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-100/80 backdrop-blur-sm pointer-events-none">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-bold text-slate-500">
          模型加载中 {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}

/**
 * 3D Canvas 壳 —— 满屏背景层。
 */
export default function SceneCanvas() {
  return (
    <div className="fixed inset-0 z-0 bg-slate-100">
      <Canvas
        camera={{ position: [30, 16, 30], fov: 42, near: 0.5, far: 200 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <Lights />
        <CameraController />
        <Sky sunPosition={[100, 30, 100]} turbidity={0.08} rayleigh={0.4} />

        {/* 软地面阴影 */}
        <ContactShadows
          position={[0, -0.05, 0]}
          scale={120}
          blur={3}
          opacity={0.3}
          far={12}
          resolution={512}
          frames={1}
        />

        <Suspense fallback={null}>
          <BuildingModel />
        </Suspense>
      </Canvas>

      <LoadOverlay />
    </div>
  );
}
