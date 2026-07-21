import SceneCanvas from './scene/SceneCanvas';
import ViewControls from './panels/ViewControls';
import FloorControls from './panels/FloorControls';
import TourControls from './panels/TourControls';

export default function DigitalTwin3DPage() {
  return (
    <div className="w-full h-screen overflow-hidden bg-slate-100">
      <SceneCanvas />
      <ViewControls />
      <FloorControls />
      <TourControls />
    </div>
  );
}
