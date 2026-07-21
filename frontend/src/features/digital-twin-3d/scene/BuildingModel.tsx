import { Suspense, useEffect, useRef, useState, useCallback, createRef, forwardRef } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import * as THREE from 'three';
import { useStore } from '../store/useStore';

const FLOOR_SPACING = 3.2;
const LOAD_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 200;
// 优先加载中间层：4F→3F→2F（当前3层；8层后: 4F→5F→3F→6F→2F→7F→1F→8F）
const BATCH_ORDER = ['4F', '3F', '2F'];

/** 带超时的 preload Promise 包装（仅调 useGLTF.preload，不做二次 fetch） */
function preloadWithTimeout(name: string, timeoutMs: number): Promise<void> {
  const url = `/models/${name}.glb`;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('NetworkTimeout')), timeoutMs);
    // useGLTF.preload 内部处理 fetch + 解码，不重复请求
    useGLTF.preload(url);
    // preload 无回调；轮询检查 drei 缓存是否写入
    const check = setInterval(() => {
      try { useGLTF(url); clearInterval(check); clearTimeout(timer); resolve(); } catch {}
    }, 100);
  });
}

/** 分批预加载：每批 ≤2 并发，按 BATCH_ORDER 顺序，NetworkTimeout 自动 200ms 退避重试1次 */
function useBatchPreload(names: string[]) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    // 按 BATCH_ORDER 排序 names
    const sorted = [...names].sort((a, b) => BATCH_ORDER.indexOf(a) - BATCH_ORDER.indexOf(b));
    const CONCURRENCY = 2;

    const run = async () => {
      for (let i = 0; i < sorted.length; i += CONCURRENCY) {
        if (cancelled) return;
        const batch = sorted.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (name) => {
          if (cancelled) return;
          try {
            await preloadWithTimeout(name, LOAD_TIMEOUT_MS);
          } catch (e: any) {
            if (e.message === 'NetworkTimeout') {
              // 200ms 退避后重试 1 次
              await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
              if (cancelled) return;
              try { await preloadWithTimeout(name, LOAD_TIMEOUT_MS); } catch (e2: any) {
                setErrors((p) => ({ ...p, [name]: e2.message }));
              }
            } else {
              setErrors((p) => ({ ...p, [name]: e.message }));
            }
          }
        }));
        if (i + CONCURRENCY < sorted.length) await new Promise((r) => requestAnimationFrame(r));
      }
    };
    run();
    return () => { cancelled = true; };
  }, [names.join(',')]);

  return { errors };
}

function FloorGhost({ y }: { y: number }) {
  return (
    <mesh position={[0, y, 0]}>
      <boxGeometry args={[14, 2.8, 10]} />
      <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.12} />
    </mesh>
  );
}

const FloorLayer = forwardRef<THREE.Group, { name: string; y: number; onCenter?: (c: THREE.Vector3) => void }>(
  function FloorLayer({ name, y, onCenter }, ref) {
    const { scene } = useGLTF(`/models/${name}.glb`);
    const materialCache = useStore((s) => s.materialCache);
    const registerFloor = useStore((s) => s.registerFloor);
    const registerSharedMaterial = useStore((s) => s.registerSharedMaterial);

    useEffect(() => {
      if (!scene) return;
      const box = new THREE.Box3().setFromObject(scene);
      const center = new THREE.Vector3(); box.getCenter(center);
      const sphere = new THREE.Sphere(); box.getBoundingSphere(sphere);
      registerFloor(name, [center.x, center.y, center.z], sphere.radius);
      onCenter?.(center); // 上报包围盒中心给 BuildingModel，用于居中旋转补偿

      scene.traverse((child: any) => {
        if (child.isMesh) {
          child.geometry?.computeBoundsTree?.();
          if (child.name.startsWith('Wall_')) child.raycast = () => {};
          // 材质共享：按 material.name 去重
          const matName = child.material?.name;
          if (matName && materialCache.has(matName)) {
            child.material = materialCache.get(matName)!;
          } else if (matName) {
            registerSharedMaterial(matName, child.material);
          }
        }
      });
      // cleanup: dispose 本地 clone 的几何体（不 clear 共享缓存！）
      return () => { scene.traverse((c: any) => { c.geometry?.dispose(); }); };
    }, [scene]);

    return (
      <primitive
        ref={ref}
        object={scene}
        position={[0, y, 0]}
        onClick={(e: any) => {
          e.stopPropagation();
          const obj = e.object;
          const nodeName = obj?.name || '';
          const type = nodeName.startsWith('Room_') ? 'Room' : nodeName.startsWith('Door_') ? 'Door' : nodeName.startsWith('Device_') ? 'Device' : null;
          if (!type) { useStore.getState().setSelectedNode(null); return; }
          const wp = new THREE.Vector3(); obj.getWorldPosition(wp);
          useStore.getState().setSelectedNode({ name: nodeName, type, worldPos: [wp.x, wp.y, wp.z] });
        }}
        onPointerOver={(e: any) => {
          e.stopPropagation();
          const nodeName = e.object?.name || '';
          if (nodeName.startsWith('Room_') || nodeName.startsWith('Door_') || nodeName.startsWith('Device_')) {
            document.body.style.cursor = 'pointer';
            e.object.material?.emissive?.set?.('#bae6fd');
            if (e.object.material?.emissiveIntensity !== undefined) e.object.material.emissiveIntensity = 0.15;
          }
        }}
        onPointerOut={(e: any) => {
          document.body.style.cursor = 'auto';
          e.object.material?.emissive?.set?.('#000000');
          if (e.object.material?.emissiveIntensity !== undefined) e.object.material.emissiveIntensity = 0;
        }}
      />
    );
  }
);

function FloorErrorOverlay({ name, msg, onRetry }: { name: string; msg: string; onRetry: () => void }) {
  return (
    <group position={[0, 0, 0]}>
      <Html center>
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-xs text-red-700 whitespace-nowrap">
          {name} 加载失败: {msg}
          <button onClick={onRetry} className="ml-2 underline text-red-800 font-bold">重试</button>
        </div>
      </Html>
    </group>
  );
}

export default function BuildingModel() {
  const floorNames = useStore((s) => s.floorNames);
  const floorMode = useStore((s) => s.floorMode);
  const focusedFloor = useStore((s) => s.focusedFloor);
  const explodeGapV = useStore((s) => s.explodeGapV);
  const explodeGapH = useStore((s) => s.explodeGapH);
  const { errors } = useBatchPreload(floorNames);
  const [retryKey, setRetryKey] = useState(0);

  // 存储每层的包围盒中心偏移（用于居中旋转）和 ref
  const floorCenters = useRef<Map<string, THREE.Vector3>>(new Map());
  const refMap = useRef<Map<string, THREE.Group>>(new Map());
  const getFloorRef = (name: string) => (node: THREE.Group | null) => {
    if (node) refMap.current.set(name, node);
    else refMap.current.delete(name);
  };
  // FloorLayer 计算完包围盒后通过 registerCenter 写入
  const registerCenter = (name: string, c: THREE.Vector3) => { floorCenters.current.set(name, c); };

  // 楼层变换: GSAP 操作 callback ref，position 含居中偏移
  useGSAP(() => {
    floorNames.forEach((name, i) => {
      const ref = refMap.current.get(name);
      if (!ref) return;
      const centerOff = floorCenters.current.get(name) ?? new THREE.Vector3(0, 0, 0);
      let targetY: number, targetZ = 0, targetOpacity = 1;
      if (focusedFloor) {
        const fi = floorNames.indexOf(focusedFloor);
        if (name === focusedFloor) { targetY = 0; targetZ = 0; targetOpacity = 1; }
        else if (i > fi) { targetY = 25; targetOpacity = 0; }
        else { targetY = -10; targetOpacity = 0.1; }
      } else if (floorMode === 'exploded') {
        targetY = i * (FLOOR_SPACING + explodeGapV / 10);
      } else if (floorMode === 'staircase') {
        targetY = i * (FLOOR_SPACING + explodeGapV / 10);
        targetZ = -(i * explodeGapH / 10);
      } else {
        targetY = i * FLOOR_SPACING;
      }
      // 居中补偿：目标位置减去包围盒中心偏移，让模型几何中心处于旋转轴心
      gsap.to(ref.position, {
        x: -centerOff.x,
        y: targetY - centerOff.y,
        z: targetZ - centerOff.z,
        duration: 0.8, ease: 'power2.inOut',
      });
      ref.traverse((c: any) => {
        if (c.isMesh && c.material) {
          c.material.transparent = true;
          c.material.depthWrite = targetOpacity >= 1;
          c.material.needsUpdate = true;
          gsap.to(c.material, { opacity: targetOpacity, duration: 0.5 });
        }
      });
    });
  }, [floorMode, focusedFloor, explodeGapV, explodeGapH, floorNames]);

  return (
    <group key={retryKey}>
      {floorNames.map((name, i) => (
        <Suspense key={name} fallback={<FloorGhost y={i * FLOOR_SPACING} />}>
          {errors[name] ? (
            <FloorErrorOverlay name={name} msg={errors[name]} onRetry={() => setRetryKey((k) => k + 1)} />
          ) : (
            <FloorLayer ref={getFloorRef(name)} name={name} y={i * FLOOR_SPACING} onCenter={(c) => registerCenter(name, c)} />
          )}
        </Suspense>
      ))}
    </group>
  );
}
