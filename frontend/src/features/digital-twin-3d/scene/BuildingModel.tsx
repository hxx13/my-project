import { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';

/** 每层楼高度间距（米） */
const FLOOR_SPACING = 3.2;

/** 3 层楼（对应 public/models/ 下的 2F/3F/4F.glb，后续替换为真正 8 层模型） */
const FLOOR_NAMES = ['2F', '3F', '4F'];

/** 单层楼 —— 独立 Suspense，先加载完的先显示 */
function FloorLayer({ name, y }: { name: string; y: number }) {
  const { scene } = useGLTF(`/models/${name}.glb`);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={cloned} position={[0, y, 0]} />;
}

/** 占位线框 —— 模型未加载完时展示 */
function FloorGhost({ y }: { y: number }) {
  return (
    <mesh position={[0, y, 0]}>
      <boxGeometry args={[14, 2.8, 10]} />
      <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.12} />
    </mesh>
  );
}

/**
 * 建筑模型 —— 加载 8 层 GLB，垂直堆叠。
 * 每层独立 Suspense，互不阻塞。无逐帧动画（纯静态展示），极致轻量。
 */
export default function BuildingModel() {
  return (
    <group>
      {FLOOR_NAMES.map((name, i) => (
        <Suspense key={name} fallback={<FloorGhost y={i * FLOOR_SPACING} />}>
          <FloorLayer name={name} y={i * FLOOR_SPACING} />
        </Suspense>
      ))}
    </group>
  );
}
