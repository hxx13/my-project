import { useMemo, useSyncExternalStore } from "react";
import type { DigitalTwinScreenConfig } from "@/features/digital-twin-screen/types";
import { createMockRoomTelemetryStore, type RoomTelemetryStore } from "@/features/digital-twin-screen/roomTelemetryStore";

export function useMockRoomTelemetrySnapshot(config: DigitalTwinScreenConfig) {
  const store = useMemo<RoomTelemetryStore>(() => createMockRoomTelemetryStore(config), [config]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
