import type { DuctLayoutDocumentV1 } from "@/features/digital-twin-screen/layout/ductLayoutTypes";
import { DUCT_LAYOUT_STORAGE_KEY } from "@/features/digital-twin-screen/layout/ductLayoutTypes";

const EMPTY: DuctLayoutDocumentV1 = { version: 1, polylines: [] };

function isDoc(v: unknown): v is DuctLayoutDocumentV1 {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.version === 1 && Array.isArray(o.polylines);
}

export function loadDuctLayoutFromStorage(): DuctLayoutDocumentV1 {
  try {
    const raw = localStorage.getItem(DUCT_LAYOUT_STORAGE_KEY);
    if (!raw) return { ...EMPTY, polylines: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!isDoc(parsed)) return { ...EMPTY, polylines: [] };
    return {
      version: 1,
      polylines: parsed.polylines.map((pl) => ({
        id: String(pl.id),
        columnIndex: Number.isFinite(pl.columnIndex) ? Math.max(0, Math.floor(pl.columnIndex)) % 4 : 0,
        points: (pl.points || []).map((p) => ({
          id: String(p.id),
          x: clamp01(Number(p.x)),
          y: clamp01(Number(p.y)),
          h: p.h === undefined ? 0 : clamp01(Number(p.h)),
        })),
      })),
    };
  } catch {
    return { ...EMPTY, polylines: [] };
  }
}

export function saveDuctLayoutToStorage(doc: DuctLayoutDocumentV1): void {
  try {
    localStorage.setItem(DUCT_LAYOUT_STORAGE_KEY, JSON.stringify(doc));
  } catch {
    /* ignore quota */
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
