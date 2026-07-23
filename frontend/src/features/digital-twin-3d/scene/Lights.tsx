import { useStore } from '../store/useStore';

/**
 * 3D 楼盘光照 — 环境光 + 双方向光。
 * 光源位置按 globalRadius 缩放，确保建筑尺寸变化时采光均匀。
 * 不依赖外部 CDN（不加载远程 HDR），避免国内网络不可达导致 Canvas 崩溃。
 */
export default function Lights() {
  const globalRadius = useStore((s) => s.globalRadius);
  // P2.13: 光源位置按 globalRadius 缩放
  const s = Math.max(1, globalRadius / 12); // scale factor (12 = default radius)
  return (
    <>
      <ambientLight intensity={1.2} color="#e2e8f0" />
      <directionalLight position={[80 * s, 60 * s, 40 * s]} intensity={1.8} color="#ffffff" />
      <directionalLight position={[-40 * s, 30 * s, -20 * s]} intensity={0.4} color="#bae6fd" />
    </>
  );
}
