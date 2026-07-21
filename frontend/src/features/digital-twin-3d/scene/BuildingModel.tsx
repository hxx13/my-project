import { Suspense, useEffect, useRef, useState, forwardRef } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import * as THREE from 'three';
import { useStore } from '../store/useStore';

const FLOOR_SPACING = 3.2;
const LOAD_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 200;
const MAX_POLL_TICKS = 150; // 15s / 100ms = 150 ticks max
// 优先加载中间层：4F→3F→2F（当前3层；8层后: 4F→5F→3F→6F→2F→7F→1F→8F）
const BATCH_ORDER = ['4F', '3F', '2F'];

/** 带超时的 preload Promise 包装（仅调 useGLTF.preload，不做二次 fetch） */
function preloadWithTimeout(name: string, timeoutMs: number, signal?: { cancelled: boolean }): Promise<void> {
  const url = `/models/${name}.glb`;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('NetworkTimeout')), timeoutMs);
    useGLTF.preload(url);
    let ticks = 0;
    const check = setInterval(() => {
      if (signal?.cancelled) { clearInterval(check); clearTimeout(timer); return; }
      ticks++;
      if (ticks > MAX_POLL_TICKS) { clearInterval(check); clearTimeout(timer); reject(new Error('PollTimeout')); return; }
      try { useGLTF(url); clearInterval(check); clearTimeout(timer); resolve(); } catch {}
    }, 100);
  });
}

/** 分批预加载：每批 ≤2 并发，按 BATCH_ORDER 顺序，NetworkTimeout 自动 200ms 退避重试1次 */
function useBatchPreload(names: string[]) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const state = { cancelled: false };
    const sorted = [...names].sort((a, b) => BATCH_ORDER.indexOf(a) - BATCH_ORDER.indexOf(b));
    const CONCURRENCY = 2;

    const run = async () => {
      for (let i = 0; i < sorted.length; i += CONCURRENCY) {
        if (state.cancelled) return;
        const batch = sorted.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (name) => {
          if (state.cancelled) return;
          try {
            await preloadWithTimeout(name, LOAD_TIMEOUT_MS, state);
          } catch (e: any) {
            if (state.cancelled) return;
            if (e.message === 'NetworkTimeout') {
              await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
              if (state.cancelled) return;
              try { await preloadWithTimeout(name, LOAD_TIMEOUT_MS, state); } catch (e2: any) {
                if (!state.cancelled) setErrors((p) => ({ ...p, [name]: e2.message }));
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
    return () => { state.cancelled = true; };
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
      onCenter?.(center);

      // 跟踪需要 dispose 的非共享材质（被替换掉的原始材质）
      const replacedMats: THREE.Material[] = [];

      scene.traverse((child: any) => {
        if (child.isMesh) {
          child.geometry?.computeBoundsTree?.();
          if (child.name.startsWith('Wall_')) child.raycast = () => {};
          const matName = child.material?.name;
          if (matName && materialCache.has(matName)) {
            const original = child.material;
            child.material = materialCache.get(matName)!;
            // 仅当原始材质不在缓存中时才 dispose
            if (original !== child.material && !materialCache.has(original.name || '__anon__')) {
              replacedMats.push(original);
            }
          } else if (matName) {
            registerSharedMaterial(matName, child.material);
          }
        }
      });

      // cleanup: dispose 几何体 + 非共享材质
      return () => {
        scene.traverse((c: any) => {
          c.geometry?.dispose();
        });
        replacedMats.forEach((m) => {
          (m as any).map?.dispose?.();
          (m as any).normalMap?.dispose?.();
          (m as any).roughnessMap?.dispose?.();
          (m as any).metalnessMap?.dispose?.();
          (m as any).aoMap?.dispose?.();
          (m as any).emissiveMap?.dispose?.();
          m.dispose();
        });
      };
    }, [scene]);

    // 跟踪上次悬停的 mesh，用于退出时正确恢复 emissive
    const lastHoveredRef = useRef<THREE.Mesh | null>(null);
    // 跟踪当前选中的 mesh，用于取消选中时恢复
    const selectedMeshRef = useRef<THREE.Mesh | null>(null);

    useEffect(() => {
      // 监听 store.selectedNode 变化，管理选中高亮
      const unsub = useStore.subscribe(
        (state) => state.selectedNode,
        (node) => {
          // 先恢复上一个选中的 mesh
          const prev = selectedMeshRef.current;
          if (prev?.material) {
            prev.material.emissive?.set?.('#000000');
            if (prev.material.emissiveIntensity !== undefined) prev.material.emissiveIntensity = 0;
          }
          selectedMeshRef.current = null;

          if (!node) return;

          // 找到新的选中 mesh
          scene.traverse((child: any) => {
            if (child.isMesh && child.name === node.name) {
              selectedMeshRef.current = child;
              child.material?.emissive?.set?.('#3b82f6');
              if (child.material?.emissiveIntensity !== undefined) child.material.emissiveIntensity = 0.3;
            }
          });
        },
        { fireImmediately: false },
      );
      return unsub;
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
            // 仅对非选中 mesh 设悬停色
            const sel = useStore.getState().selectedNode;
            if (sel?.name !== nodeName) {
              lastHoveredRef.current = e.object;
              e.object.material?.emissive?.set?.('#bae6fd');
              if (e.object.material?.emissiveIntensity !== undefined) e.object.material.emissiveIntensity = 0.15;
            }
          }
        }}
        onPointerOut={(e: any) => {
          document.body.style.cursor = 'auto';
          if (lastHoveredRef.current === e.object) {
            lastHoveredRef.current = null;
          }
          const sel = useStore.getState().selectedNode;
          if (sel?.name !== e.object?.name) {
            e.object.material?.emissive?.set?.('#000000');
            if (e.object.material?.emissiveIntensity !== undefined) e.object.material.emissiveIntensity = 0;
          }
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

  const floorCenters = useRef<Map<string, THREE.Vector3>>(new Map());
  const refMap = useRef<Map<string, THREE.Group>>(new Map());
  const materialTweenMap = useRef<Map<THREE.Material, gsap.core.Tween>>(new Map());

  const getFloorRef = (name: string) => (node: THREE.Group | null) => {
    if (node) refMap.current.set(name, node);
    else refMap.current.delete(name);
  };
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
      gsap.to(ref.position, {
        x: -centerOff.x,
        y: targetY - centerOff.y,
        z: targetZ - centerOff.z,
        duration: 0.8, ease: 'power2.inOut',
      });
      ref.traverse((c: any) => {
        if (c.isMesh && c.material) {
          // kill 旧 tween 防止叠加
          const oldTween = materialTweenMap.current.get(c.material);
          oldTween?.kill();
          // 仅 targetOpacity < 1 时启用透明渲染路径
          c.material.transparent = targetOpacity < 1;
          c.material.depthWrite = targetOpacity >= 1;
          c.material.needsUpdate = true;
          const tween = gsap.to(c.material, { opacity: targetOpacity, duration: 0.5 });
          materialTweenMap.current.set(c.material, tween);
        }
      });
    });
    // 清理已销毁 material 的 tween 引用
    return () => { materialTweenMap.current.clear(); };
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
