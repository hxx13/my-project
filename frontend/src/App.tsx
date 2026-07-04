import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { router } from "@/router";
import { io, Socket } from "socket.io-client";
import { useEventStore } from "@/store/useEventStore"; // 引入你刚改好的 Store
import toast, { Toaster } from "react-hot-toast";
import { Z_INDEX } from "@/constants/zIndex";
import { resolveSocketUrl, SOCKET_IO_CLIENT_OPTIONS, APP_BUILD_ID } from "@/config/socketUrl";
import { SOCKET_CLIENT_FORCE_RELOAD, SOCKET_SWIPE_FAILURE_ALERT, SOCKET_SWIPE_FAILURE_ALERT_DISMISS } from "@/config/socketEvents";
import { AdminGlobalDynamicIslandLayer } from "@/components/admin/AdminGlobalDynamicIslandLayer";
import { useCardReaderEnterGuard } from "@/components/scanner/useCardReaderEnterGuard";
import { ScanDelayPendingAlertSync } from "@/features/scan-delay-alert/ScanDelayPendingAlertSync";
import { useSwipeAlertStore } from "@/store/useSwipeAlertStore";
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

    return hasToken && routeHash.startsWith("#/console");
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

    useEffect(() => {
        if (!shouldConnect) return;

        const token = authStorage.getToken();
        if (!token) return; // 未登录不建立连接，避免服务端拒绝

        const socketUrl = resolveSocketUrl();
        const socket = io(socketUrl, {
            ...SOCKET_IO_CLIENT_OPTIONS,
            query: { token, v: APP_BUILD_ID },
        });
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
            //   ② 认证失败（token 过期被服务端拒绝）→ 刷新 token 后重建
            const isAuthError =
                msg.includes('not authorized') ||
                msg.includes('unauthorized') ||
                (err as any)?.data === 'not authorized';

            if (!isAuthError) {
                console.warn("[数字孪生基站] 连接失败（服务器不可达或网络波动），等待 Socket.IO 内置重连:", err.message);
                return; // ← 不 disconnect、不刷新 token，让 Socket.IO 自己重试
            }

            // 认证错误：服务端明确拒绝了 token
            console.warn("[数字孪生基站] 认证失败:", err.message);
            if (recoveryInProgressRef.current) return;
            if (recoveryAttemptRef.current >= MAX_RECOVERY_ATTEMPTS) {
                console.error("[数字孪生基站] Token 恢复已达上限，触发强制登出");
                socket.disconnect();
                window.dispatchEvent(new Event("AUTH_FORCE_LOGOUT"));
                return;
            }
            recoveryInProgressRef.current = true;
            recoveryAttemptRef.current += 1;
            socket.disconnect();
            // 尝试刷新 token，成功后触发 effect 重建 socket
            doRefresh().then((newToken) => {
                if (!socketRef.current) return; // 组件已卸载
                if (newToken) {
                    console.log("[数字孪生基站] Token 已刷新，用新 token 重建连接");
                    setSocketEpoch((e) => e + 1);
                } else {
                    console.warn("[数字孪生基站] Token 刷新失败，触发强制登出");
                    window.dispatchEvent(new Event("AUTH_FORCE_LOGOUT"));
                }
            }).catch(() => {
                console.warn("[数字孪生基站] Token 刷新异常，触发强制登出");
                window.dispatchEvent(new Event("AUTH_FORCE_LOGOUT"));
            }).finally(() => {
                recoveryInProgressRef.current = false;
            });
        });

        socket.on("reconnect_attempt", (attempt) => {
            console.log(`[数字孪生基站] 第 ${attempt} 次重连尝试…`);
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

        const onClientForceReload = (payload: { reason?: string; at?: string }) => {
            console.log("[client-reload] 收到强制刷新广播", payload);
            window.location.reload();
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

        return () => {
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
            socket.off("DASHBOARD_RANKING_REFRESH");
            socket.off("DASHBOARD_CODEX_REFRESH", onCodexRefresh);
            delete (window as any).__swipeAlertSocket;
            socket.disconnect();
        };
    }, [shouldConnect, socketEpoch, addEvent, setConnected, setPieStats, queryClient]);

    return null; // 它是个幽灵基站，不需要渲染任何 UI
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
                  <Toaster position="top-right" containerStyle={{ zIndex: Z_INDEX.globalToast }} />
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
