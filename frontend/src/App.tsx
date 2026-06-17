import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { router } from "@/router";
import { io, Socket } from "socket.io-client";
import { useEventStore } from "@/store/useEventStore"; // 引入你刚改好的 Store
import { Toaster } from "react-hot-toast";
import { resolveSocketUrl, SOCKET_IO_CLIENT_OPTIONS } from "@/config/socketUrl";
import { SOCKET_CLIENT_FORCE_RELOAD, SOCKET_SWIPE_FAILURE_ALERT, SOCKET_SWIPE_FAILURE_ALERT_DISMISS } from "@/config/socketEvents";
import { SwipeFailureBanner } from "@/features/swipe-alert/SwipeFailureBanner";
import { useSwipeAlertStore } from "@/store/useSwipeAlertStore";
import { authStorage } from "@/features/auth/authStorage";
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

// 💥 隐形的全局监听基站 (无渲染组件)
function GlobalSocketListener() {
    const addEvent = useEventStore((state) => state.addEvent);
    const setConnected = useEventStore((state) => state.setConnected);
    const setPieStats = useEventStore((state) => state.setPieStats);
    const queryClient = useQueryClient();
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const token = authStorage.getToken();
        if (!token) return; // 未登录不建立连接，避免服务端拒绝
        const socketUrl = resolveSocketUrl();
        const socket = io(socketUrl, {
            ...SOCKET_IO_CLIENT_OPTIONS,
            query: { token },
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            console.log("🟢 [数字孪生基站] WebSocket 链路已接通！");
            setConnected(true);
            // Expose socket globally for swipe-alert ACK emission
            (window as any).__swipeAlertSocket = socket;
        });

        socket.on("reconnect", () => {
            console.log("🟡 [数字孪生基站] WebSocket 已重新连接");
            setConnected(true);
            // Re-expose after reconnect (new socket instance)
            (window as any).__swipeAlertSocket = socket;
        });

        socket.on("disconnect", (reason) => {
            console.warn("🔴 [数字孪生基站] WebSocket 链路断开，将持续重连。原因:", reason);
            setConnected(false);
        });

        socket.on("connect_error", (err) => {
            console.warn("[数字孪生基站] WebSocket 连接失败，将继续重试:", err.message);
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
    }, [addEvent, setConnected, setPieStats, queryClient]);

    return null; // 它是个幽灵基站，不需要渲染任何 UI
}

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                {/* 💥 将基站挂载在 React 根节点，只要网页开着就永远在线！ */}
                <GlobalSocketListener />
                <DiagnosticErrorBoundary>
                    <RouterProvider router={router} />
                </DiagnosticErrorBoundary>
                <Toaster position="top-right" />
                <SwipeFailureBanner />
            </ThemeProvider>
        </QueryClientProvider>
    );
}

export default App;
