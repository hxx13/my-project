import { Component, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { router } from "@/router";
import type { Socket } from "socket.io-client";
import { useEventStore } from "@/store/useEventStore"; // 引入你刚改好的 Store
import toast, { Toaster } from "react-hot-toast";
import { Z_INDEX } from "@/constants/zIndex";
import { APP_BUILD_ID, getSharedSocket } from "@/config/socketUrl";
import { SOCKET_CLIENT_FORCE_RELOAD, SOCKET_SWIPE_FAILURE_ALERT, SOCKET_SWIPE_FAILURE_ALERT_DISMISS, SOCKET_CAGE_NOTICE_ALERT } from "@/config/socketEvents";
import { useClientVersionPoll, type ReloadTrigger } from "@/hooks/useClientVersionPoll";
import { GracefulReloadBanner } from "@/components/GracefulReloadBanner";

// 记录页面加载时间戳，用于防重复 reload（pending reload 机制会使重连后再次收到广播）
const PAGE_LOAD_AT = Date.now();
if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('__page_load_at', String(PAGE_LOAD_AT));
}
import { AdminGlobalDynamicIslandLayer } from "@/components/admin/AdminGlobalDynamicIslandLayer";
import { useCardReaderEnterGuard } from "@/components/scanner/useCardReaderEnterGuard";
import { ScanDelayPendingAlertSync } from "@/features/scan-delay-alert/ScanDelayPendingAlertSync";
import { useSwipeAlertStore } from "@/store/useSwipeAlertStore";
import { useCageNoticeAlertStore } from "@/store/useCageNoticeAlertStore";
import { authStorage, AUTH_USERINFO_UPDATED_EVENT } from "@/features/auth/authStorage";
import { doRefresh } from "@/api/core/tokenRefresh";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import type { AnimalRoomTelemetryPageDto, TelemetryTagItem } from "@/api/telemetryApi";
import {
  ANIMAL_ROOM_TELEMETRY_PAGE_QUERY_KEY,
  SOCKET_TELEMETRY_ANIMAL_ROOM_SNAPSHOT_FULL,
  SOCKET_TELEMETRY_ANIMAL_ROOM_TAG_DELTA,
  TELEMETRY_ANIMAL_ROOM_QUERY_KEY_PREFIX,
  mergeTelemetryTagRowsIntoAnimalRoomPageDto,
} from "@/api/telemetryApi";

class DiagnosticErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  state: { hasError: boolean; error: Error | null } = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[DiagnosticErrorBoundary] Error:", error.message);
    console.error("[DiagnosticErrorBoundary] Component stack:\n", info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return <div style={{padding:40,color:'red',fontFamily:'monospace'}}>
        <h2>Error: {this.state.error?.message}</h2>
        <pre style={{fontSize:11,whiteSpace:'pre-wrap'}}>{this.state.error?.stack}</pre>
      </div>;
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            staleTime: 1000 * 60 * 5,
        },
    },
});

/** 教职工 /console 路由 + 已登录：才建立 Socket（须在 Router 外，故订阅 hash 与登录事件） */
function useStaffConsoleSocketGate(): boolean {
    const [routeHash, setRouteHash] = useState(() => window.location.hash);
    const [hasToken, setHasToken] = useState(() => Boolean(authStorage.getToken()));

    useEffect(() => {
        const syncRoute = () => setRouteHash(window.location.hash);
        const syncAuth = () => setHasToken(Boolean(authStorage.getToken()));
        window.addEventListener("hashchange", syncRoute);
        window.addEventListener("popstate", syncRoute);
        window.addEventListener(AUTH_USERINFO_UPDATED_EVENT, syncAuth);
        return () => {
            window.removeEventListener("hashchange", syncRoute);
            window.removeEventListener("popstate", syncRoute);
            window.removeEventListener(AUTH_USERINFO_UPDATED_EVENT, syncAuth);
        };
    }, []);

    return hasToken;
}

// 💥 隐形的全局监听基站 (无渲染组件)
function GlobalSocketListener() {
    const addEvent = useEventStore((state) => state.addEvent);
    const setConnected = useEventStore((state) => state.setConnected);
    const setPieStats = useEventStore((state) => state.setPieStats);
    const queryClient = useQueryClient();
    const socketRef = useRef<Socket | null>(null);
    const shouldConnect = useStaffConsoleSocketGate();

    // 🔑 Token 过期恢复：connect_error 时刷新 token 并触发 socket 重建
    const [socketEpoch, setSocketEpoch] = useState(0);
    const recoveryInProgressRef = useRef(false);
    const recoveryAttemptRef = useRef(0);
    const MAX_RECOVERY_ATTEMPTS = 3;
    const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── 客户端版本轮询 + 优雅刷新横幅 ──
    const [reloadBanner, setReloadBanner] = useState<ReloadTrigger | null>(null);
    const handleReloadNeeded = useCallback((trigger: ReloadTrigger) => {
        setReloadBanner(prev => prev ?? trigger);
    }, []);
    useClientVersionPoll(handleReloadNeeded);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            setReloadBanner(detail);
        };
        window.addEventListener('CLIENT_RELOAD_NEEDED', handler);
        return () => window.removeEventListener('CLIENT_RELOAD_NEEDED', handler);
    }, []);

    useEffect(() => {
        if (!shouldConnect) return;

        const token = authStorage.getToken();
        if (!token) return; // 未登录不建立连接，避免服务端拒绝

        const socket = getSharedSocket();
        socketRef.current = socket;

        socket.on("connect", () => {
            console.log("🟢 [数字孪生基站] WebSocket 链路已接通！");
            setConnected(true);
            recoveryInProgressRef.current = false;
            recoveryAttemptRef.current = 0;
            if (disconnectTimerRef.current) {
                clearTimeout(disconnectTimerRef.current);
                disconnectTimerRef.current = null;
            }
            toast.dismiss("socket-disconnect");
            // Expose socket globally for swipe-alert ACK emission
            (window as any).__swipeAlertSocket = socket;
        });

        socket.on("reconnect", () => {
            console.log("🟡 [数字孪生基站] WebSocket 已重新连接");
            setConnected(true);
            recoveryInProgressRef.current = false;
            recoveryAttemptRef.current = 0;
            if (disconnectTimerRef.current) {
                clearTimeout(disconnectTimerRef.current);
                disconnectTimerRef.current = null;
            }
            toast.dismiss("socket-disconnect");
            // Re-expose after reconnect (new socket instance)
            (window as any).__swipeAlertSocket = socket;
        });

        socket.on("disconnect", (reason) => {
            console.warn("🔴 [数字孪生基站] WebSocket 链路断开，将持续重连。原因:", reason);
            setConnected(false);
            // 30 秒后仍未恢复 → 用户可见提示
            if (!disconnectTimerRef.current) {
                disconnectTimerRef.current = setTimeout(() => {
                    toast.error(
                        "实时连接已断开超过 30 秒，数据可能已过期。正在尝试恢复…",
                        { id: "socket-disconnect", duration: 6000 },
                    );
                }, 30_000);
            }
        });

        socket.on("connect_error", (err) => {
            const msg = (err?.message ?? '').toLowerCase();
            // 🔑 区分两类错误：
            //   ① 网络/服务器不可达 → 不干预，交给 Socket.IO 内置无限重连
            //   ② 认证失败（token 过期被服务端拒绝）→ 静默刷新 token，不中断重连循环
            //
            // ⚠️ 为什么把 "websocket error" / "transport error" 也当认证错误？
            // transports: ["websocket"] 模式下，服务端返回 HTTP 401 拒绝 WebSocket 升级时，
            // 浏览器 WebSocket API 不暴露 HTTP 状态码给 JavaScript，engine.io-client 只能
            // 收到一个泛化的 "websocket error"。因此无法区分「服务器宕机」和「认证被拒」。
            // 解决方案：看到这两种错误时也尝试刷新 token（最多 3 次，有并发保护）。
            const isAuthError =
                msg.includes('not authorized') ||
                msg.includes('unauthorized') ||
                msg.includes('websocket error') ||   // WebSocket-only 无法读取 HTTP 401
                msg.includes('transport error') ||   // 同上
                (err as any)?.data === 'not authorized';

            if (!isAuthError) {
                console.warn("[数字孪生基站] 连接失败（服务器不可达或网络波动），等待 Socket.IO 内置重连:", err.message);
                return; // ← 不 disconnect、不刷新 token，让 Socket.IO 自己重试
            }

            // 认证错误：token 可能已过期，尝试静默刷新
            console.warn("[数字孪生基站] 认证失败（token 可能过期）:", err.message);
            if (recoveryInProgressRef.current) return;
            recoveryInProgressRef.current = true;
            recoveryAttemptRef.current += 1;

            // 安全阀：连续多次刷新均失败 → 强制登出
            if (recoveryAttemptRef.current > MAX_RECOVERY_ATTEMPTS) {
                console.error("[数字孪生基站] Token 恢复已达上限，触发强制登出");
                socket.disconnect();
                window.dispatchEvent(new Event("AUTH_FORCE_LOGOUT"));
                recoveryInProgressRef.current = false;
                return;
            }

            // ⚠️ 不调用 socket.disconnect() —— 之前这里杀死重连循环，
            // 导致「断线超过几分钟就无法再连上」。
            doRefresh().then((newToken) => {
                if (!socketRef.current) return; // 组件已卸载
                if (newToken) {
                    console.log("[数字孪生基站] Token 已刷新，更新重连参数");
                    recoveryAttemptRef.current = 0;
                    (socket as any).io.opts.query = {
                        token: newToken,
                        v: APP_BUILD_ID,
                    };
                    socket.connect();
                } else {
                    console.warn("[数字孪生基站] Token 刷新返回空，等待下次重连");
                }
            }).catch(() => {
                console.warn("[数字孪生基站] Token 刷新网络异常，等待 Socket.IO 下次重连");
            }).finally(() => {
                recoveryInProgressRef.current = false;
            });
        });

        // 📡 监听 1：实时进出人员流水
        socket.on('TWIN_GLOBAL_EVENT', (event) => {
            console.log('⚡ 捕获实时进出动作:', event.person.name, event.action);
            addEvent(event); // 瞬间推入 Store，左侧瀑布流自动动画落下！
        });

        // 📡 监听 2：实时饼图重算结果
        socket.on('TWIN_PIE_UPDATE', (newPieData) => {
            console.log('📊 捕获最新饼图统计，更新区域画像...');
            setPieStats(newPieData); // 瞬间推入 Store，饼图自动平滑变形！
        });

        /** WinCC 定点合并后的增量行（与其它浏览器标签同源）；就地合并缓存，禁止整表 animal-room refetch（post-save-no-full-refresh.mdc） */
        const onTelemetryTagDelta = (payload: { items?: TelemetryTagItem[] }) => {
            const rows = payload?.items;
            if (!rows?.length) return;
            queryClient.setQueryData(ANIMAL_ROOM_TELEMETRY_PAGE_QUERY_KEY, (old: AnimalRoomTelemetryPageDto | undefined) => {
                if (!old?.tagItems?.length) return old;
                return mergeTelemetryTagRowsIntoAnimalRoomPageDto(old, rows);
            });
        };
        /** 服务端定时全量 refreshFromWinCc 后广播；与 pollIntervalMs 拉 GET /animal-room（sync=false）同源 */
        const onTelemetrySnapshotFull = () => {
            void queryClient.invalidateQueries({ queryKey: [...TELEMETRY_ANIMAL_ROOM_QUERY_KEY_PREFIX] });
        };
        socket.on(SOCKET_TELEMETRY_ANIMAL_ROOM_TAG_DELTA, onTelemetryTagDelta);
        socket.on(SOCKET_TELEMETRY_ANIMAL_ROOM_SNAPSHOT_FULL, onTelemetrySnapshotFull);

        const onClientForceReload = (payload: any) => {
            // ── 冷却守卫 ──
            const pageLoadAt = sessionStorage.getItem('__page_load_at');
            if (pageLoadAt && Date.now() - parseInt(pageLoadAt, 10) < 8000) return;

            // 情况 1：版本不匹配（来自 SocketRoomAssigner，连接时单发）
            // 开发模式跳过——APP_BUILD_ID='dev' 永远不匹配后端 build-meta.json 时间戳
            if (APP_BUILD_ID !== 'dev' && payload.expectedBuildId && payload.expectedBuildId !== APP_BUILD_ID) {
                if (payload.reloadId != null) {
                    sessionStorage.setItem('__last_reload_id', String(payload.reloadId));
                }
                setReloadBanner({ reason: 'version-mismatch', payload });
                return;
            }

            // 情况 2：管理员指令（来自 ClientReloadBroadcastService 广播/pending reload）
            const lastReloadId = parseInt(sessionStorage.getItem('__last_reload_id') || '0', 10);
            // 始终同步到服务端当前值——这是重启恢复的关键（与 HTTP 轮询保持一致）
            if (payload.reloadId != null) {
                sessionStorage.setItem('__last_reload_id', String(payload.reloadId));
            }
            // 仅在严格增长时触发
            if (payload.reloadId != null && payload.reloadId > lastReloadId) {
                setReloadBanner({ reason: 'admin-command', payload });
                return;
            }
        };
        socket.on(SOCKET_CLIENT_FORCE_RELOAD, onClientForceReload);

        // 📡 监听：刷卡失败灵动岛告警
        socket.on(SOCKET_SWIPE_FAILURE_ALERT, (alert) => {
            console.log("🚨 收到刷卡失败告警:", alert?.ruleName);
            useSwipeAlertStore.getState().showAlert(alert);
        });

        // 📡 监听：刷卡失败告警联动消失（触发离开动画 → 300ms 后移除）
        socket.on(SOCKET_SWIPE_FAILURE_ALERT_DISMISS, (payload) => {
            console.log("✅ 告警已被远端标记已读:", payload?.dismissedBy, payload?.alertId);
            if (payload?.alertId) {
                useSwipeAlertStore.getState().startDismiss(payload.alertId);
            }
        });

        // 📡 监听：笼位处理提示灵动岛
        socket.on(SOCKET_CAGE_NOTICE_ALERT, (alert) => {
            console.log("🐭 收到笼位处理提示:", alert?.violationId);
            useCageNoticeAlertStore.getState().showAlert(alert);
        });

        // 📡 监听：定时管理触发排行榜数据刷新
        socket.on("DASHBOARD_RANKING_REFRESH", (payload: { jobKey?: string; at?: string }) => {
            console.log("🔄 排行榜刷新信号:", payload?.jobKey);
            queryClient.invalidateQueries({ queryKey: ["dashboard", "ranking"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard", "animalRanking"] });
            if (payload?.jobKey === "DASHBOARD_RANKING_ACTIVITY") {
                queryClient.invalidateQueries({ queryKey: ["dashboard", "rankingSnapshot"] });
            }
        });

        // 📡 监听：公告/法典/惩戒配置变更 → 实时刷新大屏公告栏
        const onCodexRefresh = (payload: { key?: string; at?: string }) => {
            console.log("📋 公告配置已更新:", payload?.key);
            queryClient.invalidateQueries({ queryKey: ["public-runtime-config"] });
        };
        socket.on("DASHBOARD_CODEX_REFRESH", onCodexRefresh);

        /** 强制登出时立即断开 WebSocket，停止重连 */
        const handleForceLogout = () => {
            console.log("[数字孪生基站] 收到强制登出信号，断开 WebSocket");
            socket.disconnect();
        };
        window.addEventListener("AUTH_FORCE_LOGOUT", handleForceLogout);

        // ── 页面恢复可见时立即重连 ──
        // 浏览器对后台标签页的 setTimeout 节流（最低 60s）会导致 Socket.IO 重连退避极度缓慢。
        // 此 handler 在用户切回标签页时绕过退避，立即发起重连，确保"同步在线页"广播能及时收到。
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && socketRef.current && !socketRef.current.connected) {
                console.log("[数字孪生基站] 页面恢复可见，立即尝试重连…");
                socketRef.current.connect();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("AUTH_FORCE_LOGOUT", handleForceLogout);
            if (disconnectTimerRef.current) {
                clearTimeout(disconnectTimerRef.current);
                disconnectTimerRef.current = null;
            }
            toast.dismiss("socket-disconnect");
            socket.off(SOCKET_TELEMETRY_ANIMAL_ROOM_TAG_DELTA, onTelemetryTagDelta);
            socket.off(SOCKET_TELEMETRY_ANIMAL_ROOM_SNAPSHOT_FULL, onTelemetrySnapshotFull);
            socket.off(SOCKET_CLIENT_FORCE_RELOAD, onClientForceReload);
            socket.off(SOCKET_SWIPE_FAILURE_ALERT);
            socket.off(SOCKET_SWIPE_FAILURE_ALERT_DISMISS);
            socket.off(SOCKET_CAGE_NOTICE_ALERT);
            socket.off("DASHBOARD_RANKING_REFRESH");
            socket.off("DASHBOARD_CODEX_REFRESH", onCodexRefresh);
            delete (window as any).__swipeAlertSocket;
            socket.disconnect();
        };
    }, [shouldConnect, socketEpoch, addEvent, setConnected, setPieStats, queryClient]);

    return (
        <>
            {reloadBanner && (
                <GracefulReloadBanner
                    reason={reloadBanner.reason}
                    onDismiss={() => setReloadBanner(null)}
                />
            )}
        </>
    );
}

/** 🔒 读卡器 Enter 键全局防护：capture 阶段拦截，防止读卡器连续刷卡时意外触发聚焦按钮。
 *  在 DebugNav 未挂载的页面（如学生中心物品页）提供底层防护。
 *  DebugNav 页面有自己独立的 useCardReaderEnterGuard 实例（含扫码框 id）。 */
function GlobalCardReaderGuard() {
    useCardReaderEnterGuard();
    return null;
}

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                {/* 💥 将基站挂载在 React 根节点，只要网页开着就永远在线！ */}
                <GlobalSocketListener />
                {/* 🔒 读卡器 Enter 键全局防护（capture 阶段） */}
                <GlobalCardReaderGuard />
                <DiagnosticErrorBoundary>
                    <RouterProvider router={router} />
                </DiagnosticErrorBoundary>
                {!window.location.hash.includes('/dashboard-preview') && (
                  <Toaster position="top-center" containerStyle={{ zIndex: Z_INDEX.globalToast }} />
                )}
                {!window.location.hash.includes('/dashboard-preview') && (
                  <AdminGlobalDynamicIslandLayer />
                )}
                {!window.location.hash.includes('/dashboard-preview') && (
                  <ScanDelayPendingAlertSync />
                )}
            </ThemeProvider>
        </QueryClientProvider>
    );
}

export default App;
