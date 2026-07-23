import { Suspense, useEffect, useRef, useState, forwardRef } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import * as THREE from 'three';
import { useStore } from '../store/useStore';

const FLOOR_SPACING = 3.2;
const LOAD_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 200;
const MAX_POLL_TICKS = 150;
const GAP_SCALE = 0.1; // Step 5.5: /10 除法因子具名化
// P2.9: prefers-reduced-motion 检测
const prefersReducedMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// 优先加载中间层：4F→3F→2F→1F（当前4层）
const BATCH_ORDER = ['4F', '3F', '2F', '1F'];

/** 🔧 DEBUG: 输出模型包围盒数据到控制台，方便排查定位 */
function debugLogFloor(name: string, box: THREE.Box3, center: THREE.Vector3, radius: number, height: number) {
  console.log(
    `[3D:DEBUG] ${name} 包围盒:\n` +
    `  min  = (${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)})\n` +
    `  max  = (${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)})\n` +
    `  size = (${(box.max.x - box.min.x).toFixed(2)}, ${(box.max.y - box.min.y).toFixed(2)}, ${(box.max.z - box.min.z).toFixed(2)})\n` +
    `  center = (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})\n` +
    `  radius = ${radius.toFixed(2)}, height = ${height.toFixed(2)}`
  );
}

/**
 * 带超时的 preload Promise 包装。
 * @remarks 依赖 drei `useGLTF()` 在缓存未命中时抛出异常以检测加载完成。
 *   此行为在 @react-three/drei ^10.7 验证通过。若 drei 升级后行为变化，
 *   降级路径：MAX_POLL_TICKS 超时 → PollTimeout → 上游 setErrors → FloorErrorOverlay 手动重试。
 */
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
      try { useGLTF(url); clearInterval(check); clearTimeout(timer); resolve(); } catch { /* polling */ }
    }, 100);
  });
}

/** 分批预加载 */
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

/** 检测 material 是否被同层其他 mesh 共享 */
function isSharedMaterial(mesh: THREE.Mesh): boolean {
  let count = 0;
  mesh.parent?.traverse((c: any) => {
    if (c.isMesh && c.material === mesh.material && c !== mesh) count++;
  });
  return count > 0;
}

const FloorLayer = forwardRef<THREE.Group, { name: string; y: number }>(
  function FloorLayer({ name, y }, ref) {
    const { scene } = useGLTF(`/models/${name}.glb`);
    const materialCache = useStore((s) => s.materialCache);
    const registerFloor = useStore((s) => s.registerFloor);
    const registerSharedMaterial = useStore((s) => s.registerSharedMaterial);

    useEffect(() => {
      if (!scene) return;
      const box = new THREE.Box3().setFromObject(scene);
      const center = new THREE.Vector3(); box.getCenter(center);
      const sphere = new THREE.Sphere(); box.getBoundingSphere(sphere);
      const modelHeight = box.max.y - box.min.y; // 模型实际 Y 轴高度

      // 🔧 DEBUG: 输出包围盒数据
      debugLogFloor(name, box, center, sphere.radius, modelHeight);

      // 存储纯本地坐标（不加 Y 偏移，世界位置由 useGSAP 统一管理）
      registerFloor(name, [center.x, center.y, center.z], sphere.radius, modelHeight);

      const replacedMats: THREE.Material[] = [];
      scene.traverse((child: any) => {
        if (child.isMesh) {
          // Step 6.7: BVH 失败时 warn
          try { child.geometry?.computeBoundsTree?.(); } catch { console.warn(`[3D] BVH build failed for ${child.name || '(anon)'} in ${name}`); }
          // Step 6.5: 非交互 mesh（墙体/板/天花板/结构/玻璃/地面等）禁用 raycast
          // 只有 Room_ / Door_ / Device_ 前缀可点击
          if (!/^(Room_|Door_|Device_)/.test(child.name) && child.isMesh) {
            child.raycast = () => {};
          }
          const matName = child.material?.name;
          if (matName && materialCache.has(matName)) {
            const original = child.material;
            child.material = materialCache.get(matName)!;
            if (original !== child.material && !materialCache.has(original.name || '__anon__')) {
              replacedMats.push(original);
            }
          } else if (matName) {
            registerSharedMaterial(matName, child.material);
          }
        }
      });

      return () => {
        scene.traverse((c: any) => { c.geometry?.dispose(); });
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

    // Step 6.2: 直接持有选中 mesh 引用（替代 name-based traverse）
    const selectedMeshRef = useRef<THREE.Mesh | null>(null);

    // Step 6.6: cursor 恢复 on unmount
    useEffect(() => {
      return () => {
        document.body.style.cursor = 'auto';
      };
    }, []);

    return (
      <primitive
        ref={ref}
        object={scene}
        /* position 由 GSAP 全权管理；不设 React prop 避免 R3F reconciler 覆盖 GSAP 值 */
        onClick={(e: any) => {
          e.stopPropagation();
          const obj = e.object;
          if (!obj?.isMesh) return;

          const nodeName = obj.name || '';
          const type = nodeName.startsWith('Room_') ? 'Room'
            : nodeName.startsWith('Door_') ? 'Door'
            : nodeName.startsWith('Device_') ? 'Device'
            : null;

          // 清除上一个选中的 emissive
          const prev = selectedMeshRef.current;
          if (prev && prev !== obj) {
            prev.material?.emissive?.set?.('#000000');
            if (prev.material?.emissiveIntensity !== undefined) prev.material.emissiveIntensity = 0;
          }

          if (!type) {
            // 点击非交互 mesh → 取消选中
            selectedMeshRef.current = null;
            useStore.getState().setSelectedNode(null);
            return;
          }

          // Step 6.3: 共享材质 clone 只在 onClick 执行
          if (isSharedMaterial(obj)) {
            obj.material = (obj.material as THREE.Material).clone();
          }

          obj.material?.emissive?.set?.('#3b82f6');
          if (obj.material?.emissiveIntensity !== undefined) obj.material.emissiveIntensity = 0.3;
          selectedMeshRef.current = obj;

          // P3: 使用点击交点 e.point 的精确世界坐标（保证在房间表面）
          const hitPoint = e.point.clone();
          const floorData = useStore.getState().floors[name];
          const floorHalfH = floorData ? floorData.height / 2 : 0;

          // XZ 来自精确点击，Y 固定在楼层顶部 + 2m
          const gpos = scene.position;
          const localX = hitPoint.x - gpos.x;
          const localZ = hitPoint.z - gpos.z;
          const cardWorldY = gpos.y + (floorData?.localCenter[1] ?? 0) + floorHalfH + 2;

          console.log(
            `[3D:DEBUG:CARD] ${nodeName}:\n` +
            `  hitPoint=(${hitPoint.x.toFixed(2)},${hitPoint.y.toFixed(2)},${hitPoint.z.toFixed(2)})\n` +
            `  groupPos=(${gpos.x.toFixed(2)},${gpos.y.toFixed(2)},${gpos.z.toFixed(2)})\n` +
            `  localXZ=(${localX.toFixed(2)},${localZ.toFixed(2)}) 卡片Y=${cardWorldY.toFixed(2)}`
          );
          useStore.getState().setSelectedNode({
            name: nodeName, type, floorName: name,
            localX, localZ,
            worldPos: [hitPoint.x, cardWorldY, hitPoint.z],
          });
        }}
        onPointerOver={(e: any) => {
          e.stopPropagation();
          const obj = e.object;
          const nodeName = obj?.name || '';
          if (nodeName.startsWith('Room_') || nodeName.startsWith('Door_') || nodeName.startsWith('Device_')) {
            // P0.6: hover 不 clone 材质，不 mutate 共享材质 — 仅改 cursor
            document.body.style.cursor = 'pointer';
          }
        }}
        onPointerOut={(e: any) => {
          document.body.style.cursor = 'auto';
        }}
      />
    );
  }
);

function FloorErrorOverlay({ name, msg, onRetry }: { name: string; msg: string; onRetry: () => void }) {
  return (
    <group position={[0, 0, 0]}>
      <Html center>
        {/* P2.8: 语义令牌替代硬编码颜色 */}
        <div className="bg-[var(--app-color-surface-elevated)] border border-red-400 rounded-lg px-4 py-2 text-xs text-[var(--app-color-text-primary)] whitespace-nowrap shadow-lg">
          {name} 加载失败: {msg}
          <button onClick={onRetry} className="ml-2 underline text-[var(--app-color-accent)] font-bold">重试</button>
        </div>
      </Html>
    </group>
  );
}

export default function BuildingModel() {
  const floorNames = useStore((s) => s.floorNames);
  const floorMode = useStore((s) => s.floorMode);
  const focusedFloor = useStore((s) => s.focusedFloor);
  const explodeConfig = useStore((s) => s.explodeConfig);
  const floors = useStore((s) => s.floors);
  const effectiveSpacing = useStore((s) => s.effectiveSpacing);
  const { errors } = useBatchPreload(floorNames);

  // P2.3: 页面离开时清理 drei GLTF 缓存，释放 GPU 内存
  useEffect(() => {
    return () => {
      floorNames.forEach((name) => {
        useGLTF.clear(`/models/${name}.glb`);
      });
    };
  }, [floorNames]);

  // P3: 注册全局高亮清除回调 + 重写 setSelectedNode 确保调用
  useEffect(() => {
    console.log('[3D:DEBUG:HIGHLIGHT] 注册 _clearHighlight');
    useStore.setState({
      _clearHighlight: () => {
        let cleared = 0;
        refMap.current.forEach((group, floorName) => {
          group.traverse((c: any) => {
            if (c.isMesh && c.material) {
              const mats = Array.isArray(c.material) ? c.material : [c.material];
              mats.forEach((mat: any) => {
                if (mat.emissive) {
                  mat.emissive.set('#000000');
                  cleared++;
                }
                if (mat.emissiveIntensity !== undefined && mat.emissiveIntensity > 0) {
                  mat.emissiveIntensity = 0;
                }
                mat.needsUpdate = true;
              });
            }
          });
        });
        console.log(`[3D:DEBUG:HIGHLIGHT] _clearHighlight 清除了 ${cleared} 个 emissive`);
      },
    });
    return () => { useStore.setState({ _clearHighlight: null }); };
  }, []);

  // P3: 楼层聚焦时只允许点击该楼层的 Room_/Door_/Device_，穿透其他楼层
  useEffect(() => {
    floorNames.forEach((name) => {
      try {
        const gltf: any = useGLTF(`/models/${name}.glb`);
        if (!gltf?.scene) return;
        const isFocused = focusedFloor === name;
        gltf.scene.traverse((child: any) => {
          if (!child.isMesh) return;
          const isInteractive = /^(Room_|Door_|Device_)/.test(child.name || '');
          if (isInteractive) {
            if (focusedFloor && !isFocused) {
              // 聚焦模式：非目标楼层的房间 → 射线穿透
              child.raycast = () => {};
            } else {
              // 目标楼层 或 无聚焦 → 恢复默认 raycast
              delete child.raycast;
            }
          } else {
            // 非交互 mesh 始终穿透
            child.raycast = () => {};
          }
        });
      } catch { /* GLB not loaded yet */ }
    });
  }, [focusedFloor, floorNames]);

  // Step 5.6: per-floor retry
  const [retryKeys, setRetryKeys] = useState<Record<string, number>>({});

  const refMap = useRef<Map<string, THREE.Group>>(new Map());
  const materialTweenMap = useRef<Map<THREE.Material, gsap.core.Tween>>(new Map());
  const positionTweenMap = useRef<Map<string, gsap.core.Tween>>(new Map());
  const initializedRef = useRef<Set<string>>(new Set());

  const getFloorRef = (name: string) => (node: THREE.Group | null) => {
    if (node) refMap.current.set(name, node);
    else refMap.current.delete(name);
  };

  // Step 5.1: loadedCount 依赖，确保楼层加载完成后重新动画
  const loadedCount = Object.values(floors).filter((f) => f.loaded).length;

  // P3: 预计算全局 X/Z 中心（所有楼层统一偏移，确保对齐到世界原点附近）
  const globalAvgX = (() => {
    const loaded = Object.values(floors).filter((f) => f.loaded);
    if (loaded.length === 0) return 0;
    return loaded.reduce((s, f) => s + f.localCenter[0], 0) / loaded.length;
  })();
  const globalAvgZ = (() => {
    const loaded = Object.values(floors).filter((f) => f.loaded);
    if (loaded.length === 0) return 0;
    return loaded.reduce((s, f) => s + f.localCenter[2], 0) / loaded.length;
  })();

  // P3: 地面偏移 — 用于 exploded/staircase 模式重新堆叠时 1F 底部对齐 y=0
  const groundOffset = effectiveSpacing / 2;

  // 楼层变换: GSAP 操作 callback ref
  // 注意: loadedCount=0 时跳过，等所有楼层注册后再执行
  useGSAP(() => {
    if (loadedCount === 0) return;
    floorNames.forEach((name, i) => {
      const ref = refMap.current.get(name);
      if (!ref) return;

      const floor = floors[name];
      const localCY = floor ? floor.localCenter[1] : 0;

      // P3 fix: 模型在 Blender 中已堆叠好（每层 GLB 自带正确的世界 Y）
      // stacked 模式: 只做 XZ 居中，Y 轴保持 Blender 原始位置不变
      // exploded/staircase 模式: 从地面重新堆叠 + 额外间隙
      let targetX = -globalAvgX;
      let targetY: number;
      let targetZ = -globalAvgZ;
      let targetOpacity = 1;

      if (focusedFloor) {
        const fi = floorNames.indexOf(focusedFloor);
        if (name === focusedFloor) {
          // 聚焦层: 保持 Blender 位置不变
          targetY = 0;
          targetOpacity = 1;
        } else if (i > fi) {
          // 上方层: 飞到高处 + 隐藏
          targetY = 25;
          targetOpacity = 0;
        } else {
          // 下方层: 下移 + 半透明
          targetY = -10;
          targetOpacity = 0.1;
        }
      } else if (floorMode === 'exploded') {
        targetY = groundOffset + i * (effectiveSpacing + explodeConfig.gapV * GAP_SCALE) - localCY;
      } else if (floorMode === 'staircase') {
        targetY = groundOffset + i * (effectiveSpacing + explodeConfig.gapV * GAP_SCALE) - localCY;
        targetX = i * explodeConfig.offsetX * GAP_SCALE - globalAvgX;
        targetZ = i * explodeConfig.offsetZ * GAP_SCALE - globalAvgZ;
      } else {
        // stacked: 模型已在 Blender 中堆叠，Y 轴不做任何偏移
        targetY = 0;
      }

      // Step 5.3: 首次初始化用 gsap.set() 瞬间定位，后续用 gsap.to() 动画
      const isInitial = !initializedRef.current.has(name);

      // kill 旧 tween
      const oldPosTween = positionTweenMap.current.get(name);
      oldPosTween?.kill();

      if (isInitial) {
        initializedRef.current.add(name);
        gsap.set(ref.position, { x: targetX, y: targetY, z: targetZ });
      } else {
        const posTween = gsap.to(ref.position, {
          x: targetX, y: targetY, z: targetZ,
          duration: prefersReducedMotion ? 0 : 0.8, ease: 'power2.inOut',
        });
        positionTweenMap.current.set(name, posTween);
      }

      // 材质 opacity
      ref.traverse((c: any) => {
        if (c.isMesh && c.material) {
          const oldTween = materialTweenMap.current.get(c.material);
          oldTween?.kill();
          c.material.transparent = targetOpacity < 1;
          c.material.depthWrite = targetOpacity >= 1;
          c.material.needsUpdate = true;
          const tween = gsap.to(c.material, { opacity: targetOpacity, duration: prefersReducedMotion ? 0 : 0.5 });
          materialTweenMap.current.set(c.material, tween);
        }
      });

      // P3: 动态更新选中卡片3D世界坐标 = group当前位置 + 本地偏移
      const sel = useStore.getState().selectedNode;
      if (sel && sel.floorName === name && floor) {
        const cardWorldX = targetX + sel.localX;
        const cardWorldY = targetY + floor.localCenter[1] + floor.height / 2 + 2;
        const cardWorldZ = targetZ + sel.localZ;
        useStore.getState().updateSelectedWorldPos([cardWorldX, cardWorldY, cardWorldZ]);
      }
    });

    // 🔧 DEBUG: 输出各楼层世界位置
    console.log(
      '[3D:DEBUG] 楼层世界位置 (GSAP 计算后):\n' +
      floorNames.map((name, i) => {
        const ref = refMap.current.get(name);
        const f = floors[name];
        const lc = f ? f.localCenter : [0,0,0];
        const wp = ref ? ref.position : new THREE.Vector3();
        return `  ${name}: group=(${wp.x.toFixed(2)}, ${wp.y.toFixed(2)}, ${wp.z.toFixed(2)}), localCenter=(${lc[0].toFixed(2)}, ${lc[1].toFixed(2)}, ${lc[2].toFixed(2)})`;
      }).join('\n') +
      `\n  effectiveSpacing=${effectiveSpacing.toFixed(2)}, groundOffset=${groundOffset.toFixed(2)}`
    );

    return () => {
      materialTweenMap.current.clear();
      positionTweenMap.current.clear();
    };
  }, [floorMode, focusedFloor, explodeConfig, floorNames, loadedCount, effectiveSpacing, groundOffset]);

  return (
    <group>
      {floorNames.map((name, i) => {
        const retryKey = retryKeys[name] ?? 0;
        return (
          <Suspense key={name} fallback={<FloorGhost y={i * FLOOR_SPACING} />}>
            {errors[name] ? (
              <FloorErrorOverlay
                name={name}
                msg={errors[name]}
                onRetry={() => setRetryKeys((p) => ({ ...p, [name]: (p[name] ?? 0) + 1 }))}
              />
            ) : (
              // Step 5.6: per-floor key 仅影响错误/重试，正常加载不设 key
              <FloorLayer
                key={retryKey > 0 ? `${name}-r${retryKey}` : name}
                ref={getFloorRef(name)}
                name={name}
                y={i * FLOOR_SPACING}
              />
            )}
          </Suspense>
        );
      })}
    </group>
  );
}
