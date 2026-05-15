import type { DigitalTwinScreenConfig, RoomCellModel } from "@/features/digital-twin-screen/types";
import { buildInitialRoomGrid, mulberry32 } from "@/features/digital-twin-screen/buildInitialRoomGrid";

export type RoomTelemetrySnapshot = {
  rooms: RoomCellModel[];
  updatedAt: number;
};

type Listener = () => void;

/** 抽象数据源：Mock 与后续 HTTP 实现可互换 */
export interface RoomTelemetryStore {
  subscribe: (onStoreChange: Listener) => () => void;
  getSnapshot: () => RoomTelemetrySnapshot;
}

export function createMockRoomTelemetryStore(config: DigitalTwinScreenConfig): RoomTelemetryStore {
  let rooms = buildInitialRoomGrid(config);
  let updatedAt = Date.now();
  /** useSyncExternalStore：getSnapshot 必须在数据未变时返回同一引用，否则会无限重渲染 */
  let cachedSnapshot: RoomTelemetrySnapshot = { rooms, updatedAt };
  const listeners = new Set<Listener>();
  const rnd = mulberry32(config.mock.seed ^ 0x9e3779b9);

  const tick = () => {
    const drift = 0.12;
    rooms = rooms.map((cell) => ({
      ...cell,
      temperatureC: Math.round((cell.temperatureC + (rnd() - 0.5) * drift) * 10) / 10,
      humidityPct: Math.min(99, Math.max(5, Math.round(cell.humidityPct + (rnd() - 0.5) * 1.2))),
    }));
    updatedAt = Date.now();
    cachedSnapshot = { rooms, updatedAt };
    listeners.forEach((l) => l());
  };

  let intervalId: number | null = null;

  return {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange);
      if (intervalId === null) {
        intervalId = window.setInterval(tick, config.animation.mockDriftIntervalMs);
      }
      return () => {
        listeners.delete(onStoreChange);
        if (listeners.size === 0 && intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      };
    },
    getSnapshot() {
      return cachedSnapshot;
    },
  };
}
