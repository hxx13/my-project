import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { router } from "@/router";
import { io } from "socket.io-client";
import { useEventStore } from "@/store/useEventStore"; // 引入你刚改好的 Store
import { Toaster } from "react-hot-toast";
import { resolveSocketUrl } from "@/config/socketUrl";
import { SOCKET_CLIENT_FORCE_RELOAD } from "@/config/socketEvents";
import type { AnimalRoomTelemetryPageDto, TelemetryTagItem } from "@/api/telemetryApi";
import {
  ANIMAL_ROOM_TELEMETRY_PAGE_QUERY_KEY,
  SOCKET_TELEMETRY_ANIMAL_ROOM_SNAPSHOT_FULL,
  SOCKET_TELEMETRY_ANIMAL_ROOM_TAG_DELTA,
  TELEMETRY_ANIMAL_ROOM_QUERY_KEY_PREFIX,
  mergeTelemetryTagRowsIntoAnimalRoomPageDto,
} from "@/api/telemetryApi";

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

    useEffect(() => {
        const socketUrl = resolveSocketUrl();
        const socket = io(socketUrl, {
            transports: ["websocket"],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
        });

        socket.on('connect', () => {
            console.log('🟢 [数字孪生基站] WebSocket 链路已接通！');
            setConnected(true);
        });

        socket.on('disconnect', () => {
            console.log('🔴 [数字孪生基站] WebSocket 链路断开！');
            setConnected(false);
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

        return () => {
            socket.off(SOCKET_TELEMETRY_ANIMAL_ROOM_TAG_DELTA, onTelemetryTagDelta);
            socket.off(SOCKET_TELEMETRY_ANIMAL_ROOM_SNAPSHOT_FULL, onTelemetrySnapshotFull);
            socket.off(SOCKET_CLIENT_FORCE_RELOAD, onClientForceReload);
            socket.disconnect();
        };
    }, [addEvent, setConnected, setPieStats, queryClient]);

    return null; // 它是个幽灵基站，不需要渲染任何 UI
}

function App() {
    return (

        <QueryClientProvider client={queryClient}>
            {/* 💥 将基站挂载在 React 根节点，只要网页开着就永远在线！ */}
            <GlobalSocketListener />
            <RouterProvider router={router} />
            <Toaster position="top-right" />
        </QueryClientProvider>
    );
}

export default App;
