import type { DtSceneWidget, DtWidgetBindingSlot, DtWidgetGraphicHint } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import type { TelemetryTagItem } from "@/telemetry-view/types";

/** 显式 graphicHint 优先；否则按首槽 format 示意（与 dtEditorShapeCatalog 一致） */
export function effectiveGraphicHint(w: DtSceneWidget): DtWidgetGraphicHint {
  if (w.graphicAsset?.dataUrl || (w.graphicLibraryAssetId && w.graphicAsset?.mime)) return "customAsset";
  const g = w.graphicHint;
  if (
    g === "lamp" ||
    g === "bar" ||
    g === "acUnit" ||
    g === "card" ||
    g === "roomPanel" ||
    g === "envThp" ||
    g === "envThpRow" ||
    g === "dashButton" ||
    g === "switchToggle" ||
    g === "switchRocker" ||
    g === "switchEstop" ||
    g === "switchDual" ||
    g === "ahuPlenum" ||
    g === "deviceFan" ||
    g === "devicePump" ||
    g === "deviceCompressor" ||
    g === "customAsset"
  )
    return g;
  const b0 = w.bindings[0];
  if (!b0) return "card";
  return b0.format === "number" ? "bar" : "lamp";
}

export function resolvePrimaryBindingSlot(w: DtSceneWidget): DtWidgetBindingSlot | undefined {
  const pid = (w.primaryBindingId || "").trim();
  if (pid) {
    const hit = w.bindings.find((b) => b.id === pid);
    if (hit) return hit;
  }
  return w.bindings[0];
}

export function firstCommandBindingSlot(w: DtSceneWidget): DtWidgetBindingSlot | undefined {
  return w.bindings.find((b) => b.bindingKind === "command" && (b.variableName || "").trim().length > 0);
}

export function semanticTag(b: DtWidgetBindingSlot): string {
  switch (b.semantic) {
    case "temperature":
      return "温";
    case "humidity":
      return "湿";
    case "pressure":
      return "压";
    default:
      return (b.label || "·").slice(0, 2);
  }
}

export function parseBoolish(raw: string): boolean | null {
  const t = raw.trim().toLowerCase();
  if (t === "1" || t === "true" || t === "on" || t === "开" || t === "yes") return true;
  if (t === "0" || t === "false" || t === "off" || t === "关" || t === "no") return false;
  const n = Number(t.replace(",", "."));
  if (Number.isFinite(n)) return n !== 0;
  return null;
}

export function bindingRunActive(b: DtWidgetBindingSlot | undefined, item: TelemetryTagItem | undefined): boolean {
  if (!b) return false;
  if (!item || item.value === undefined || item.value === null || item.value === "") return false;
  const raw = String(item.value).trim();
  const bl = parseBoolish(raw);
  if (bl === true) return true;
  if (bl === false) return false;
  if (b.format === "number") {
    const n = Number(raw.replace(",", "."));
    if (Number.isFinite(n)) return n > 0.5;
  }
  return false;
}

export function deviceSpinClass(run: boolean): string {
  return run ? "motion-safe:animate-[spin_2.2s_linear_infinite]" : "";
}

export function formatBindingValue(b: DtWidgetBindingSlot, item: TelemetryTagItem | undefined): string {
  if (!item || item.value === undefined || item.value === null || item.value === "") return "—";
  const raw = String(item.value).trim();
  if (b.format === "text") return raw;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return raw;
  const d = b.decimals ?? 1;
  return n.toFixed(Math.max(0, Math.min(6, d)));
}

export function lampStateFromBinding(
  primary: DtWidgetBindingSlot | undefined,
  item: TelemetryTagItem | undefined
): "on" | "off" | "unknown" {
  if (!primary) return "unknown";
  const raw = item?.value != null && item.value !== "" ? String(item.value).trim() : "";
  const bool0 = raw ? parseBoolish(raw) : null;
  if (bool0 === true) return "on";
  if (bool0 === false) return "off";
  return "unknown";
}
