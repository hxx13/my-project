/* eslint-disable react-refresh/only-export-components -- Provider 与 hook 同文件，仅 Twin 壳使用 */
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
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
    fetchMiniPreferences,
    saveMiniPreferences,
    type DashboardAutoReturnPreferences,
} from "@/api/domains/me.api";
import { AUTH_USERINFO_UPDATED_EVENT, authStorage } from "@/features/auth/authStorage";
import { useBrowserFullscreen } from "@/hooks/useBrowserFullscreen";
import {
    DASHBOARD_AUTO_RETURN_DEFAULT_MINUTES,
    DASHBOARD_PATH,
    isDashboardPath,
    normalizeIdleMinutes,
} from "@/utils/dashboardAutoReturn";

type ResolvedPref = { enabled: boolean; idleMinutes: number };

export type DashboardAutoReturnContextValue = ResolvedPref & {
    hydrated: boolean;
    setEnabled: (enabled: boolean) => void;
    setIdleMinutes: (minutes: number) => void;
};

const DashboardAutoReturnContext = createContext<DashboardAutoReturnContextValue | null>(null);

const DISABLED: ResolvedPref = {
    enabled: false,
    idleMinutes: DASHBOARD_AUTO_RETURN_DEFAULT_MINUTES,
};

function resolveUserId(): string {
    return authStorage.getUserInfo()?.id?.trim() || authStorage.getUserIdFromToken()?.trim() || "";
}

function readPref(raw: DashboardAutoReturnPreferences | null | undefined): ResolvedPref {
    return {
        enabled: raw?.enabled === true,
        idleMinutes: normalizeIdleMinutes(raw?.idleMinutes),
    };
}

/**
 * 没人操作时浏览器不给全屏（Fullscreen API 要「用户手势」）。
 * 被拒就挂一次性监听：操作员下次碰屏幕 / 敲键盘时把全屏补上 —— 总比他满屏去找一个按钮强。
 */
function armFullscreenOnNextGesture(request: () => Promise<void>) {
    const once = () => {
        window.removeEventListener("pointerdown", once, true);
        window.removeEventListener("keydown", once, true);
        if (!document.fullscreenElement) void request().catch(() => undefined);
    };
    window.addEventListener("pointerdown", once, true);
    window.addEventListener("keydown", once, true);
}

/** 算「静默多久」的采样间隔。看门狗只需要分钟级精度，5 秒一核足够便宜 */
const IDLE_CHECK_INTERVAL_MS = 5_000;
const IDLE_ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
    "mousemove",
    "keydown",
    "click",
    "scroll",
    "touchstart",
];

/**
 * 循环式无人操作看门狗：静默够久就叫一次，叫完继续盯着。
 *
 * <p>**为什么不复用 {@code useIdleTimeout}**：那个是一次性的「预警 → 到时退出」，
 * 触发后不再武装，要等用户下一次操作才重新计时。看门狗要的恰恰相反 ——
 * 触发之后（把人送回大屏、补上全屏）还得继续守着，否则值班的人走开两轮就只有第一轮管用。
 */
function useIdleWatchdog(enabled: boolean, idleMs: number, onIdle: () => void) {
    const onIdleRef = useRef(onIdle);
    onIdleRef.current = onIdle;

    useEffect(() => {
        if (!enabled || idleMs <= 0) return;

        let lastActivityAt = Date.now();
        const touch = () => {
            lastActivityAt = Date.now();
        };
        IDLE_ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));

        const timer = window.setInterval(() => {
            if (Date.now() - lastActivityAt < idleMs) return;
            // 先重置再叫：否则每个采样点都会重复触发
            lastActivityAt = Date.now();
            onIdleRef.current();
        }, IDLE_CHECK_INTERVAL_MS);

        return () => {
            window.clearInterval(timer);
            IDLE_ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, touch));
        };
    }, [enabled, idleMs]);
}

/**
 * 无人操作看门狗。
 *
 * <p>只做两件事，且**各自判各自的**：
 * <ul>
 *   <li>不在仪表盘上 → 跳回仪表盘；已经在就不跳（别打断正在看的人）；</li>
 *   <li>不在全屏 → 请求全屏；已经在就不动。</li>
 * </ul>
 */
function DashboardAutoReturnWatch() {
    const { enabled, idleMinutes } = useDashboardAutoReturn();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { requestFullscreen, targetRef } = useBrowserFullscreen();

    // 目标绑整篇文档：这里没有可挂 ref 的宿主节点，不绑的话 hook 每次都会打一条「未绑定元素」的 warn
    useEffect(() => {
        targetRef.current = document.documentElement;
    }, [targetRef]);

    const onIdle = useCallback(() => {
        if (!isDashboardPath(pathname)) {
            navigate(DASHBOARD_PATH);
        }
        if (document.fullscreenElement) return;
        void requestFullscreen().catch(() => undefined);
        armFullscreenOnNextGesture(requestFullscreen);
    }, [pathname, navigate, requestFullscreen]);

    useIdleWatchdog(enabled, idleMinutes * 60_000, onIdle);

    return null;
}

export function DashboardAutoReturnProvider({ children }: { children: ReactNode }) {
    const [pref, setPref] = useState<ResolvedPref>(DISABLED);
    const [hydrated, setHydrated] = useState(false);
    const [userKey, setUserKey] = useState(() => resolveUserId());
    /** 提交时要拿「按下开关那一刻」的值算下一个完整对象，故留一份 ref 镜像 */
    const prefRef = useRef<ResolvedPref>(DISABLED);

    useEffect(() => {
        prefRef.current = pref;
    }, [pref]);

    useEffect(() => {
        const onUser = () => setUserKey(resolveUserId());
        window.addEventListener(AUTH_USERINFO_UPDATED_EVENT, onUser);
        return () => window.removeEventListener(AUTH_USERINFO_UPDATED_EVENT, onUser);
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (!userKey) {
            setPref(DISABLED);
            setHydrated(true);
            return () => {
                cancelled = true;
            };
        }
        setHydrated(false);
        void (async () => {
            const prefs = await fetchMiniPreferences();
            if (cancelled) return;
            setPref(readPref(prefs?.dashboardAutoReturn));
            setHydrated(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [userKey]);

    /**
     * 保存：**只提交自己这一项**。
     *
     * <p>mini-preferences 是多个模块共用的一个 JSON，整包回写会用陈旧副本冲掉别人刚存的字段；
     * 局部提交才是安全的（契约见 saveMiniPreferences 上的注释）。
     */
    const commit = useCallback(async (next: ResolvedPref) => {
        const prev = prefRef.current;
        setPref(next);
        prefRef.current = next;
        try {
            await saveMiniPreferences({ dashboardAutoReturn: next });
        } catch (e) {
            setPref(prev);
            prefRef.current = prev;
            toast.error(e instanceof Error ? e.message : "保存失败");
        }
    }, []);

    const setEnabled = useCallback(
        (enabled: boolean) => {
            void commit({ ...prefRef.current, enabled });
        },
        [commit],
    );

    const setIdleMinutes = useCallback(
        (minutes: number) => {
            void commit({ ...prefRef.current, idleMinutes: normalizeIdleMinutes(minutes) });
        },
        [commit],
    );

    const value = useMemo<DashboardAutoReturnContextValue>(
        () => ({ ...pref, hydrated, setEnabled, setIdleMinutes }),
        [pref, hydrated, setEnabled, setIdleMinutes],
    );

    return (
        <DashboardAutoReturnContext.Provider value={value}>
            {children}
            <DashboardAutoReturnWatch />
        </DashboardAutoReturnContext.Provider>
    );
}

export function useDashboardAutoReturn(): DashboardAutoReturnContextValue {
    const ctx = useContext(DashboardAutoReturnContext);
    if (!ctx) {
        throw new Error("useDashboardAutoReturn 必须在 DashboardAutoReturnProvider 内使用");
    }
    return ctx;
}
