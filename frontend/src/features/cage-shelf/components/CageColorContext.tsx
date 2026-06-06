import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { fetchUserCageColors, saveUserCageColors, type CageColorConfig } from "@/api/domains/cageShelf.api";

/* ================================================================== */
/*  Defaults — single source of truth for ALL status colors             */
/* ================================================================== */

export const DEFAULT_COLORS: CageColorConfig = {
  NORMAL:          { bg: "#f1f5f9", border: "#cbd5e1" },
  COHABITATION:   { bg: "#a7f3d0", border: "#10b981" },
  SPECIAL_FEEDING: { bg: "#fecaca", border: "#ef4444" },
  NEED_DIVIDE:    { bg: "#fef08a", border: "#eab308" },
  HEALTH_ABNORMAL: { bg: "#e9d5ff", border: "#a855f7" },
  ANIMAL_TRANSFER: { bg: "#cffafe", border: "#06b6d4" },
};

/* ================================================================== */
/*  Context                                                             */
/* ================================================================== */

interface CageColorCtx {
  colors: CageColorConfig;
  setColor: (code: string, bg: string, border: string) => void;
  resetColor: (code: string) => void;
  resetAll: () => void;
  loading: boolean;
}

const Ctx = createContext<CageColorCtx>({
  colors: DEFAULT_COLORS,
  setColor: () => {},
  resetColor: () => {},
  resetAll: () => {},
  loading: true,
});

export function CageColorProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<CageColorConfig>({ ...DEFAULT_COLORS });
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  // Load from backend on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchUserCageColors();
        if (cancelled) return;
        setColors({ ...DEFAULT_COLORS, ...remote });
      } catch { /* keep defaults */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const debouncedSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await saveUserCageColors(colorsRef.current); } catch { /* ignore */ }
    }, 600);
  }, []);

  const setColor = useCallback((code: string, bg: string, border: string) => {
    setColors((prev) => {
      const next = { ...prev, [code]: { bg, border } };
      colorsRef.current = next;
      return next;
    });
    debouncedSave();
  }, [debouncedSave]);

  const resetColor = useCallback((code: string) => {
    const def = DEFAULT_COLORS[code];
    if (!def) return;
    setColors((prev) => {
      const next = { ...prev, [code]: { ...def } };
      colorsRef.current = next;
      return next;
    });
    debouncedSave();
  }, [debouncedSave]);

  const resetAll = useCallback(() => {
    setColors({ ...DEFAULT_COLORS });
    colorsRef.current = { ...DEFAULT_COLORS };
    debouncedSave();
  }, [debouncedSave]);

  return (
    <Ctx.Provider value={{ colors, setColor, resetColor, resetAll, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCageColors() {
  return useContext(Ctx);
}
