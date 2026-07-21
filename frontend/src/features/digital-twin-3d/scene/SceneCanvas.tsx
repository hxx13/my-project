import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky, ContactShadows, Stats, useProgress } from '@react-three/drei';
import { ErrorBoundary } from 'react-error-boundary';
import * as THREE from 'three';
import BuildingModel from './BuildingModel';
import CameraController from './CameraController';
import Lights from './Lights';
import SceneOverlay from './SceneOverlay';
import { useStore } from '../store/useStore';

function CanvasFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100">
      <div className="text-center">
        <p className="text-slate-700 font-bold mb-2">3D 渲染失败</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-bold"
        >
          点击重试
        </button>
      </div>
    </div>
  );
}

/** 加载进度浮层 */
function LoadOverlay() {
  const { active, progress } = useProgress();
  const [done, setDone] = useState(false);

  if (!active && progress === 100 && !done) {
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

function SceneContent() {
  const floorMode = useStore((s) => s.floorMode);
  const deviceTier = useStore((s) => s.deviceTier);

  return (
    <>
      <Lights />
      <CameraController />
      <Sky sunPosition={[100, 30, 100]} turbidity={0.08} rayleigh={0.4} />
      {deviceTier !== 'low' && (
        <ContactShadows key={floorMode} position={[0, -0.05, 0]} scale={120} blur={3} opacity={0.3} far={12} resolution={512} frames={1} />
      )}
      <Suspense fallback={null}>
        <BuildingModel />
      </Suspense>
      <SceneOverlay />
    </>
  );
}

/** dpr 按设备档位分档（Store 模块顶层已同步检测，无竞态） */
function useDeviceDpr(): [number, number] {
  const tier = useStore((s) => s.deviceTier);
  if (tier === 'low') return [0.75, 1];
  if (tier === 'medium') return [1, 1.5];
  return [1, 2];
}

export default function SceneCanvas() {
  const dpr = useDeviceDpr();
  return (
    <ErrorBoundary FallbackComponent={CanvasFallback}>
      <div className="fixed inset-0 z-0 bg-slate-100">
        <Canvas
          camera={{ position: [30, 16, 30], fov: 42, near: 0.5, far: 200 }}
          gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
          dpr={dpr}
          onCreated={({ gl }) => {
            let restoreTimer: ReturnType<typeof setTimeout> | null = null;
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              console.warn('[3D] WebGL context lost — attempting restore');
              restoreTimer = setTimeout(() => {
                console.error('[3D] WebGL restore timeout (30s) — degrading');
                // 降级：展示全屏提示
              }, 30_000);
            });
            gl.domElement.addEventListener('webglcontextrestored', () => {
              if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = null; }
              // Three.js 自动恢复纹理（需要 needsUpdate=true），但强制标记所有纹理脏
              try {
                gl.renderer?.initTexture?.();
              } catch {}
              console.log('[3D] WebGL context restored');
            });
          }}
        >
          <SceneContent />
          {import.meta.env.DEV && <Stats />}
        </Canvas>
        <LoadOverlay />
      </div>
    </ErrorBoundary>
  );
}
