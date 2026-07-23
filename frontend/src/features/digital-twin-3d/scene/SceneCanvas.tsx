import { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Stats, useProgress } from '@react-three/drei';
import { ErrorBoundary } from 'react-error-boundary';
import * as THREE from 'three';
import BuildingModel from './BuildingModel';
import CameraController from './CameraController';
import Lights from './Lights';
import CardTracker from './CardTracker';
import { useStore } from '../store/useStore';

function CanvasFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-color-surface-page)]">
      <div className="text-center">
        <p className="text-[var(--app-color-text-primary)] font-bold mb-2">3D 渲染失败</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-[var(--app-color-accent)] text-white rounded-lg text-sm font-bold"
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
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--app-color-surface-page)]/80 backdrop-blur-sm pointer-events-none">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-[3px] border-[var(--app-color-accent)] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-bold text-[var(--app-color-text-secondary)]">
          模型加载中 {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}

/** P2.1 + P2.2: WebGL Context Lost 恢复层 */
function ContextLostOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-color-surface-page)]/90 backdrop-blur-sm">
      <div className="text-center max-w-sm">
        <p className="text-[var(--app-color-text-primary)] font-bold text-lg mb-2">3D 渲染引擎无响应</p>
        <p className="text-[var(--app-color-text-secondary)] text-sm mb-4">
          GPU 驱动可能已崩溃。请刷新页面以恢复 3D 视图。
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-[var(--app-color-accent)] text-white rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
        >
          刷新页面
        </button>
      </div>
    </div>
  );
}

function SceneContent() {
  const floorMode = useStore((s) => s.floorMode);
  const deviceTier = useStore((s) => s.deviceTier);
  const globalRadius = useStore((s) => s.globalRadius);
  const effectiveSpacing = useStore((s) => s.effectiveSpacing);
  const floorCount = useStore((s) => s.floorNames.length);

  // P2.4: 阴影参数按建筑尺寸动态计算
  const shadowFar = Math.max(50, effectiveSpacing * floorCount * 5);
  const shadowScale = Math.max(200, globalRadius * 8);

  return (
    <>
      <Lights />
      <CameraController />
      {/* 地基平面：接收阴影，禁用 raycast 防止阻挡楼层点击 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow raycast={() => {}}>
        <planeGeometry args={[shadowScale * 3, shadowScale * 3]} />
        <meshStandardMaterial color="#e8e4df" transparent opacity={0.6} depthWrite={false} />
      </mesh>
      {deviceTier !== 'low' && (
        <ContactShadows
          key={floorMode}
          position={[0, -0.05, 0]}
          scale={shadowScale}
          blur={3}
          opacity={0.3}
          far={shadowFar}
          resolution={512}
          frames={1}
        />
      )}
      <Suspense fallback={null}>
        <BuildingModel />
      </Suspense>
      <CardTracker />
    </>
  );
}

function useDeviceDpr(): [number, number] {
  const tier = useStore((s) => s.deviceTier);
  if (tier === 'low') return [0.75, 1];
  if (tier === 'medium') return [1, 1.5];
  return [1, 2];
}

export default function SceneCanvas() {
  const dpr = useDeviceDpr();
  const [contextLost, setContextLost] = useState(false);

  return (
    <ErrorBoundary FallbackComponent={CanvasFallback}>
      <div className="fixed inset-0 z-0 bg-[var(--app-color-surface-page)]">
        <Canvas
          camera={{ position: [80, 50, 80], fov: 42, near: 0.5, far: 500 }}
          gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
          dpr={dpr}
          onCreated={({ gl, scene }) => {
            // 场景背景色（替代 Sky 组件，避免高角度白色闪烁）
            scene.background = new THREE.Color('#d4dfe8');
            let restoreTimer: ReturnType<typeof setTimeout> | null = null;
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              console.warn('[3D] WebGL context lost — attempting restore');
              restoreTimer = setTimeout(() => {
                console.error('[3D] WebGL restore timeout (30s) — degrading');
                setContextLost(true);
              }, 30_000);
            });
            gl.domElement.addEventListener('webglcontextrestored', () => {
              if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = null; }
              setContextLost(false);
              scene.traverse((obj: any) => {
                if (obj.material) {
                  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                  mats.forEach((mat: any) => {
                    for (const val of Object.values(mat)) {
                      if (val instanceof THREE.Texture) val.needsUpdate = true;
                    }
                  });
                }
              });
              console.log('[3D] WebGL context restored');
            });
          }}
        >
          <SceneContent />
          {/* P2.14: DEV-ONLY stats.js bypasses React DOM. Known HMR leak — stale panels
              accumulate on Fast Refresh. Cleaned in useEffect below. */}
          {import.meta.env.DEV && <Stats />}
        </Canvas>
        <LoadOverlay />
        {contextLost && <ContextLostOverlay />}
      </div>
    </ErrorBoundary>
  );
}
