import { Environment } from '@react-three/drei';

export default function Lights() {
  return (
    <>
      <ambientLight intensity={1.2} color="#e2e8f0" />
      <directionalLight position={[80, 60, 40]} intensity={1.8} color="#ffffff" />
      <directionalLight position={[-40, 30, -20]} intensity={0.4} color="#bae6fd" />
      <Environment preset="city" />
    </>
  );
}
