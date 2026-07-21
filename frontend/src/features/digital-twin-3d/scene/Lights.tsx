import { Environment } from '@react-three/drei';
import { useStore } from '../store/useStore';

export default function Lights() {
  const deviceTier = useStore((s) => s.deviceTier);

  return (
    <>
      <ambientLight intensity={1.2} color="#e2e8f0" />
      <directionalLight position={[80, 60, 40]} intensity={1.8} color="#ffffff" />
      <directionalLight position={[-40, 30, -20]} intensity={0.4} color="#bae6fd" />
      {deviceTier !== 'low' && <Environment preset="city" />}
    </>
  );
}
