/* eslint-disable react-refresh/only-export-components -- Provider 与 hook 同文件，仅 Twin 壳使用 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import {
    defaultMiniPreferences,
    fetchMiniPreferences,
    saveMiniPreferences,
    type MiniPreferences,
    type TwinWebChromeThemeId,
} from "@/api/domains/me.api";
import { AUTH_USERINFO_UPDATED_EVENT, authStorage } from "@/features/auth/authStorage";
import { SCI_FI_DASHBOARD_STORAGE_KEY, SCI_FI_DEFAULT_ENABLED } from "@/features/dashboard-scifi-theme/sciFiDashboardTheme.config";

function resolveUserId(): string {
    return authStorage.getUserInfo()?.id?.trim() || authStorage.getUserIdFromToken()?.trim() || "";
}

function normalizeThemeId(raw: string | null | undefined): TwinWebChromeThemeId {
    const t = String(raw ?? "").trim();
    return t === "dashboardSciFi" ? "dashboardSciFi" : "standard";
}

function themeCacheKey(userId: string): string {
    return `twin_web_chrome_theme_cache_${userId}`;
}

function readThemeCache(userId: string): TwinWebChromeThemeId | null {
    if (!userId || typeof window === "undefined") return null;
    try {
        const v = window.localStorage.getItem(themeCacheKey(userId));
        if (v === "dashboardSciFi" || v === "standard") return v;
    } catch {
        /* ignore */
    }
    return null;
}

function writeThemeCache(userId: string, theme: TwinWebChromeThemeId) {
    if (!userId || typeof window === "undefined") return;
    try {
        window.localStorage.setItem(themeCacheKey(userId), theme);
    } catch {
        /* ignore */
    }
}

function clearLegacyDeviceOnlyKey() {
    try {
        window.localStorage.removeItem(SCI_FI_DASHBOARD_STORAGE_KEY);
    } catch {
        /* ignore */
    }
}

export type TwinChromeThemeContextValue = {
    enabled: boolean;
    themeId: TwinWebChromeThemeId;
    hydrated: boolean;
    setEnabled: (v: boolean) => void;
    setThemeId: (id: TwinWebChromeThemeId) => void;
    toggle: () => void;
};

const TwinChromeThemeContext = createContext<TwinChromeThemeContextValue | null>(null);

export function TwinChromeThemeProvider({ children }: { children: ReactNode }) {
    const [themeId, setThemeIdState] = useState<TwinWebChromeThemeId>("standard");
    const [hydrated, setHydrated] = useState(false);
    const [userKey, setUserKey] = useState(() => resolveUserId());
    const lastPrefsRef = useRef<MiniPreferences | null>(null);

    useEffect(() => {
        const onUser = () => setUserKey(resolveUserId());
        window.addEventListener(AUTH_USERINFO_UPDATED_EVENT, onUser);
        return () => window.removeEventListener(AUTH_USERINFO_UPDATED_EVENT, onUser);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const uid = userKey;

        const applyLocalFallback = () => {
            const cached = uid ? readThemeCache(uid) : null;
            if (cached) {
                setThemeIdState(cached);
                return;
            }
            if (typeof window === "undefined") {
                setThemeIdState(SCI_FI_DEFAULT_ENABLED ? "dashboardSciFi" : "standard");
                return;
            }
            try {
                const raw = window.localStorage.getItem(SCI_FI_DASHBOARD_STORAGE_KEY);
                if (raw === null) {
                    setThemeIdState(SCI_FI_DEFAULT_ENABLED ? "dashboardSciFi" : "standard");
                } else {
                    setThemeIdState(raw === "1" || raw === "true" ? "dashboardSciFi" : "standard");
                }
            } catch {
                setThemeIdState("standard");
            }
        };

        if (!uid) {
            applyLocalFallback();
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
                clearLegacyDeviceOnlyKey();
                const base = prefs ?? defaultMiniPreferences();
                lastPrefsRef.current = base;
                const tid = normalizeThemeId(base.twinWebChromeTheme);
                setThemeIdState(tid);
                writeThemeCache(uid, tid);
            } catch {
                if (!cancelled) applyLocalFallback();
            } finally {
                if (!cancelled) setHydrated(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [userKey]);

    const persistTheme = useCallback(async (next: TwinWebChromeThemeId) => {
        const uid = resolveUserId();
        if (uid) writeThemeCache(uid, next);
        setThemeIdState(next);
        if (!uid) {
            toast.error("未登录，主题仅本次会话有效");
            return;
        }
        try {
            const base = lastPrefsRef.current ?? (await fetchMiniPreferences()) ?? defaultMiniPreferences();
            const merged: MiniPreferences = {
                ...base,
                roomWatch: base.roomWatch ?? { selections: [] },
                twinWebChromeTheme: next,
            };
            const saved = await saveMiniPreferences(merged);
            lastPrefsRef.current = saved;
            clearLegacyDeviceOnlyKey();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "保存主题偏好失败");
            try {
                const prefs = await fetchMiniPreferences();
                if (prefs) {
                    lastPrefsRef.current = prefs;
                    setThemeIdState(normalizeThemeId(prefs.twinWebChromeTheme));
                }
            } catch {
                /* ignore */
            }
        }
    }, []);

    const setEnabled = useCallback(
        (enabled: boolean) => {
            void persistTheme(enabled ? "dashboardSciFi" : "standard");
        },
        [persistTheme]
    );

    const setThemeId = useCallback(
        (id: TwinWebChromeThemeId) => {
            void persistTheme(id);
        },
        [persistTheme]
    );

    const toggle = useCallback(() => {
        void persistTheme(themeId === "dashboardSciFi" ? "standard" : "dashboardSciFi");
    }, [persistTheme, themeId]);

    const enabled = themeId === "dashboardSciFi";

    const value = useMemo(
        () => ({ enabled, themeId, hydrated, setEnabled, setThemeId, toggle }),
        [enabled, themeId, hydrated, setEnabled, setThemeId, toggle]
    );

    return <TwinChromeThemeContext.Provider value={value}>{children}</TwinChromeThemeContext.Provider>;
}

export function useTwinChromeTheme(): TwinChromeThemeContextValue {
    const ctx = useContext(TwinChromeThemeContext);
    if (!ctx) {
        throw new Error("useTwinChromeTheme 必须在 TwinChromeThemeProvider 内使用");
    }
    return ctx;
}
