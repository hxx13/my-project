import SceneCanvas from './scene/SceneCanvas';
import SceneOverlay from './scene/SceneOverlay';
import ViewControls from './panels/ViewControls';
import FloorControls from './panels/FloorControls';
import TourControls from './panels/TourControls';

export default function DigitalTwin3DPage() {
  return (
    <div className="w-full h-screen overflow-hidden bg-[var(--app-color-surface-page)]">
      <SceneCanvas />
      <SceneOverlay />
      <ViewControls />
      <FloorControls />
      <TourControls />
    </div>
  );
}
