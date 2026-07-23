import { createContext, useContext } from "react";

export type AnimalTelemetryFxIconVariant = "standard" | "scifi";

/** 动物房温湿度页内图标：标准白底用高对比；科幻壳用 neon（见 AnimalTelemetryRoomFxIcon） */
export const AnimalTelemetryFxIconVariantContext = createContext<AnimalTelemetryFxIconVariant>("standard");

export function useAnimalTelemetryFxIconVariant(): AnimalTelemetryFxIconVariant {
  return useContext(AnimalTelemetryFxIconVariantContext);
}
