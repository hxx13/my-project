import type { DtSceneWidget } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { effectiveGraphicHint, firstCommandBindingSlot } from "@/features/digital-twin-screen/layout/widgetSymbols/widgetBindingUtils";

/** 浏览态（非编辑）下该图元 plate 是否应接收指针事件以便写点 */
export function widgetPlatePointerAutoBrowse(w: DtSceneWidget): boolean {
  const hint = effectiveGraphicHint(w);
  if (hint === "customAsset") {
    return w.assetInteractionMode === "commandSurface";
  }
  const cmd = firstCommandBindingSlot(w);
  if (!cmd) return false;
  if (hint === "dashButton") return true;
  if (
    hint === "switchToggle" ||
    hint === "switchRocker" ||
    hint === "switchEstop" ||
    hint === "switchDual"
  )
    return true;
  return false;
}
