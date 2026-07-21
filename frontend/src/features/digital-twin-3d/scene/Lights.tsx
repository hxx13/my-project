/**
 * 3D 楼盘光照 — 环境光 + 双方向光。
 * 不依赖外部 CDN（不加载远程 HDR），避免国内网络不可达导致 Canvas 崩溃。
 * 如需环境反射增强材质表现力，后续可部署本地 HDR 文件并改用 <Environment files="..." />。
 */
export default function Lights() {
  return (
    <>
      <ambientLight intensity={1.2} color="#e2e8f0" />
      <directionalLight position={[80, 60, 40]} intensity={1.8} color="#ffffff" />
      <directionalLight position={[-40, 30, -20]} intensity={0.4} color="#bae6fd" />
    </>
  );
}
