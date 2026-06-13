import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import toast from "react-hot-toast";
import {
  defaultMiniPreferences,
  fetchMiniPreferences,
  saveMiniPreferences,
  type MiniPreferences,
} from "@/api/domains/me.api";
import { AUTH_USERINFO_UPDATED_EVENT, authStorage } from "@/features/auth/authStorage";
import { THEME_REGISTRY, getThemeById } from "./themeRegistry";
import type { ThemeDefinition } from "./types";
import {
  type AppearanceSchedulePrefs,
  type ColorMode,
  defaultAppearanceSchedulePrefs,
  msUntilNextScheduleBoundary,
  normalizeAppearanceSchedulePrefs,
  readLocalAppearanceSchedule,
  resolveEffectiveColorMode,
  resolveEffectiveThemeId,
  themeIdForColorMode,
  writeLocalAppearanceSchedule,
} from "./themeSchedule";

interface ThemeContextValue {
  themeId: string;
  theme: ThemeDefinition;
  setThemeId: (id: string) => void;
  themes: ThemeDefinition[];
  cycleTheme: () => void;
  /** 当前生效的亮/暗色（含定时与手动覆盖） */
  effectiveMode: ColorMode;
  autoScheduleEnabled: boolean;
  setAutoScheduleEnabled: (enabled: boolean) => void;
  /** 手动切换亮/暗色；自动模式下为临时覆盖至下一 schedule 边界 */
  toggleLightDark: () => void;
  lightStart: string;
  lightEnd: string;
  setScheduleTimes: (lightStart: string, lightEnd: string) => void;
  hydrated: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const LEGACY_THEME_KEY = "twin-theme";

function resolveUserId(): string {
  return authStorage.getUserInfo()?.id?.trim() || authStorage.getUserIdFromToken()?.trim() || "";
}

function appearanceFromMiniPrefs(prefs: MiniPreferences | null | undefined): AppearanceSchedulePrefs {
  const base = defaultAppearanceSchedulePrefs();
  const a = prefs?.appearanceSchedule;
  const legacy = readLegacyThemeId();
  if (!a) {
    if (legacy) {
      return normalizeAppearanceSchedulePrefs({
        autoScheduleEnabled: false,
        manualThemeId: legacy,
      });
    }
    return base;
  }
  return normalizeAppearanceSchedulePrefs({
    ...base,
    ...a,
    manualThemeId: a.manualThemeId || legacy || base.manualThemeId,
  });
}

function readLegacyThemeId(): string | null {
  try {
    const stored = localStorage.getItem(LEGACY_THEME_KEY);
    if (stored && THEME_REGISTRY.some((t) => t.id === stored)) return stored;
  } catch {
    /* ignore */
  }
  return null;
}

function writeLegacyThemeId(id: string) {
  try {
    localStorage.setItem(LEGACY_THEME_KEY, id);
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<AppearanceSchedulePrefs>(() => readLocalAppearanceSchedule());
  const [hydrated, setHydrated] = useState(false);
  const [userKey, setUserKey] = useState(() => resolveUserId());
  const [scheduleTick, setScheduleTick] = useState(0);
  const lastPrefsRef = useRef<MiniPreferences | null>(null);
  const persistTimerRef = useRef<number | null>(null);

  const normalized = useMemo(() => normalizeAppearanceSchedulePrefs(appearance), [appearance]);
  const themeId = useMemo(
    () => resolveEffectiveThemeId(normalized, new Date()),
    // scheduleTick 用于定时边界触发重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [normalized, scheduleTick]
  );
  const theme = getThemeById(themeId);
  const effectiveMode = useMemo(
    () => resolveEffectiveColorMode(normalized, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [normalized, scheduleTick]
  );

  useEffect(() => {
    const onUser = () => setUserKey(resolveUserId());
    window.addEventListener(AUTH_USERINFO_UPDATED_EVENT, onUser);
    return () => window.removeEventListener(AUTH_USERINFO_UPDATED_EVENT, onUser);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const uid = userKey;

    const applyLocal = () => {
      setAppearance(readLocalAppearanceSchedule());
    };

    if (!uid) {
      applyLocal();
      setHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    setHydrated(false);
    void (async () => {
      try {
        const prefs = await fetchMiniPreferences();
        if (cancelled) return;
        const base = prefs ?? defaultMiniPreferences();
        lastPrefsRef.current = base;
        setAppearance(appearanceFromMiniPrefs(base));
        writeLocalAppearanceSchedule(appearanceFromMiniPrefs(base));
      } catch {
        if (!cancelled) applyLocal();
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userKey]);

  const persistAppearance = useCallback(async (next: AppearanceSchedulePrefs) => {
    const normalizedNext = normalizeAppearanceSchedulePrefs(next);
    setAppearance(normalizedNext);
    writeLocalAppearanceSchedule(normalizedNext);
    writeLegacyThemeId(resolveEffectiveThemeId(normalizedNext));

    const uid = resolveUserId();
    if (!uid) return;

    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const base = lastPrefsRef.current ?? (await fetchMiniPreferences()) ?? defaultMiniPreferences();
          const merged: MiniPreferences = {
            ...base,
            roomWatch: base.roomWatch ?? { selections: [] },
            appearanceSchedule: normalizedNext,
          };
          const saved = await saveMiniPreferences(merged);
          lastPrefsRef.current = saved;
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "保存外观偏好失败");
        }
      })();
    }, 400);
  }, []);

  const setThemeId = useCallback(
    (id: string) => {
      if (!THEME_REGISTRY.some((t) => t.id === id)) return;
      const next: AppearanceSchedulePrefs = {
        ...normalized,
        autoScheduleEnabled: false,
        manualOverride: null,
        manualThemeId: id,
      };
      void persistAppearance(next);
    },
    [normalized, persistAppearance]
  );

  const setAutoScheduleEnabled = useCallback(
    (enabled: boolean) => {
      const next: AppearanceSchedulePrefs = {
        ...normalized,
        autoScheduleEnabled: enabled,
        manualOverride: enabled ? null : normalized.manualOverride,
      };
      void persistAppearance(next);
    },
    [normalized, persistAppearance]
  );

  const setScheduleTimes = useCallback(
    (lightStart: string, lightEnd: string) => {
      void persistAppearance({
        ...normalized,
        lightStart,
        lightEnd,
        manualOverride: null,
      });
    },
    [normalized, persistAppearance]
  );

  const toggleLightDark = useCallback(() => {
    const nextMode: ColorMode = effectiveMode === "light" ? "dark" : "light";
    if (normalized.autoScheduleEnabled) {
      void persistAppearance({
        ...normalized,
        manualOverride: nextMode,
      });
      return;
    }
    void persistAppearance({
      ...normalized,
      manualThemeId: themeIdForColorMode(nextMode),
    });
  }, [effectiveMode, normalized, persistAppearance]);

  const cycleTheme = useCallback(() => {
    toggleLightDark();
  }, [toggleLightDark]);

  useEffect(() => {
    if (!normalized.autoScheduleEnabled) return;
    const onBoundary = () => {
      setScheduleTick((t) => t + 1);
      setAppearance((prev) => {
        const p = normalizeAppearanceSchedulePrefs(prev);
        if (!p.manualOverride) return prev;
        const cleared = { ...p, manualOverride: null as ColorMode | null };
        writeLocalAppearanceSchedule(cleared);
        writeLegacyThemeId(resolveEffectiveThemeId(cleared));
        const uid = resolveUserId();
        if (uid) {
          void (async () => {
            try {
              const base = lastPrefsRef.current ?? (await fetchMiniPreferences()) ?? defaultMiniPreferences();
              const merged: MiniPreferences = {
                ...base,
                roomWatch: base.roomWatch ?? { selections: [] },
                appearanceSchedule: cleared,
              };
              const saved = await saveMiniPreferences(merged);
              lastPrefsRef.current = saved;
            } catch {
              /* 边界清除失败不阻断 UI */
            }
          })();
        }
        return cleared;
      });
    };
    const arm = () => {
      const ms = msUntilNextScheduleBoundary(new Date(), normalized.lightStart, normalized.lightEnd);
      return window.setTimeout(() => {
        onBoundary();
        armTimer = arm();
      }, ms);
    };
    let armTimer = arm();
    return () => window.clearTimeout(armTimer);
  }, [normalized.autoScheduleEnabled, normalized.lightStart, normalized.lightEnd]);

  /** 全站（含 /login）同步亮/暗色到根节点，供登录轮播等读取 */
  useEffect(() => {
    const el = document.documentElement;
    for (const t of THEME_REGISTRY) {
      el.classList.remove(t.className);
    }
    el.classList.remove("dark");
    el.classList.add(theme.className);
    if (effectiveMode === "dark") {
      el.classList.add("dark");
    }
    el.dataset.appColorMode = effectiveMode;
    el.dataset.appThemeId = themeId;
  }, [theme.className, effectiveMode, themeId]);

  const value = useMemo(
    () => ({
      themeId,
      theme,
      setThemeId,
      themes: THEME_REGISTRY,
      cycleTheme,
      effectiveMode,
      autoScheduleEnabled: normalized.autoScheduleEnabled !== false,
      setAutoScheduleEnabled,
      toggleLightDark,
      lightStart: normalized.lightStart ?? defaultAppearanceSchedulePrefs().lightStart!,
      lightEnd: normalized.lightEnd ?? defaultAppearanceSchedulePrefs().lightEnd!,
      setScheduleTimes,
      hydrated,
    }),
    [
      themeId,
      theme,
      setThemeId,
      cycleTheme,
      effectiveMode,
      normalized.autoScheduleEnabled,
      normalized.lightStart,
      normalized.lightEnd,
      setAutoScheduleEnabled,
      toggleLightDark,
      setScheduleTimes,
      hydrated,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
