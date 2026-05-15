import { useEffect, useState } from "react";
import type { DtSceneWidget } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import { dtGraphicLibraryGet } from "@/features/digital-twin-screen/layout/dtGraphicLibraryIdb";

/** 解析自定义图 src：优先内联 dataUrl，否则按 graphicLibraryAssetId 读 IndexedDB */
export function useResolvedGraphicDataUrl(w: DtSceneWidget): string | null {
  const [src, setSrc] = useState<string | null>(() => w.graphicAsset?.dataUrl?.trim() || null);

  useEffect(() => {
    const inline = w.graphicAsset?.dataUrl?.trim();
    if (inline) {
      setSrc(inline);
      return;
    }
    const lid = (w.graphicLibraryAssetId || "").trim();
    if (!lid) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    void dtGraphicLibraryGet(lid).then((row) => {
      if (cancelled) return;
      const u = row?.dataUrl?.trim();
      setSrc(u && u.startsWith("data:") ? u : null);
    });
    return () => {
      cancelled = true;
    };
  }, [w.graphicAsset?.dataUrl, w.graphicLibraryAssetId]);

  return src;
}
