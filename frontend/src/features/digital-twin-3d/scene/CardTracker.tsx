import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/useStore';

/**
 * Canvas 内部组件：每帧将选中节点的 3D 世界坐标投影到屏幕 2D 坐标。
 * 结果写入 store.screenProjection，供 Canvas 外的 SceneOverlay 使用。
 */
export default function CardTracker() {
  const { camera, gl } = useThree();
  const lastLog = useRef(0);

  useFrame(({ clock }) => {
    const node = useStore.getState().selectedNode;
    if (!node) {
      if (useStore.getState().screenProjection !== null) {
        useStore.getState().setScreenProjection(null);
      }
      return;
    }

    const worldPos = new THREE.Vector3(...node.worldPos);
    const screenPos = worldPos.clone().project(camera);

    const rect = gl.domElement.getBoundingClientRect();
    const x = (screenPos.x * 0.5 + 0.5) * rect.width + rect.left;
    const y = (-screenPos.y * 0.5 + 0.5) * rect.height + rect.top;
    const visible = screenPos.z < 1;

    // 🔧 DEBUG: 每秒输出一次
    if (visible && clock.elapsedTime - lastLog.current > 1) {
      lastLog.current = clock.elapsedTime;
      console.log(
        `[3D:DEBUG:CARD:TRACK] 3D(${worldPos.x.toFixed(1)},${worldPos.y.toFixed(1)},${worldPos.z.toFixed(1)}) → 屏幕(${x.toFixed(0)},${y.toFixed(0)})`
      );
    }

    useStore.getState().setScreenProjection({ x, y, visible });
  });

  return null;
}

