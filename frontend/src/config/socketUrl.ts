import type { ManagerOptions, Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { authStorage } from "@/features/auth/authStorage";

/** Socket.IO 与 Spring HTTP 分端口时，默认把 API 端口换为 9092 */
const DEFAULT_SOCKET_PORT = 9092;

/** 前端构建版本标识：Vite define 注入，开发模式为 'dev'，生产构建为时间戳 */
export const APP_BUILD_ID: string =
    (typeof __BUILD_ID__ !== 'undefined') ? __BUILD_ID__ : 'dev';

/**
 * 全局 Socket.IO 客户端选项：断线后持续重连（不设 reconnectionAttempts 上限），
 * 避免「重试 10 次后永久离线」导致「同步在线页」广播收不到。
 */
export const SOCKET_IO_CLIENT_OPTIONS: Partial<ManagerOptions> = {
    transports: ["websocket"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 15000,
    timeout: 10000,
};

/**
 * 解析 Socket.IO 根地址（不含 path，socket.io-client 会加 /socket.io/）。
 *
 * 优先级：VITE_SOCKET_URL → VITE_API_BASE_URL 推导 → 当前页同域 → localhost
 *
 * HTTPS 页面核心原则：浏览器禁止混合内容（Mixed Content），WebSocket 必须走 wss://。
 * 如果 VITE_API_BASE_URL 指向的主机与当前页面不同（例如 API 走裸 IP 而页面走域名），
 * 则跳过 API 推导，直接使用页面同域——由 nginx 按 /socket.io/ 路径统一代理。
 */
export function resolveSocketUrl(): string {
    const isHttpsPage =
        typeof window !== "undefined" &&
        window.location?.protocol === "https:";

    // ① 显式指定 Socket 地址
    const explicit = import.meta.env.VITE_SOCKET_URL;
    if (typeof explicit === "string" && explicit.trim() !== "") {
        const url = explicit.trim();
        if (isHttpsPage && url.startsWith("ws://")) {
            return url.replace("ws://", "wss://");
        }
        if (isHttpsPage && url.startsWith("http://")) {
            return url.replace("http://", "https://");
        }
        return url;
    }

    // ② 从 API 地址推导（仅当 API 主机与页面主机相同、或非 HTTPS 时）
    const apiBase = import.meta.env.VITE_API_BASE_URL;
    if (typeof apiBase === "string" && apiBase.trim() !== "") {
        try {
            const apiUrl = new URL(apiBase.trim());
            const pageHost =
                typeof window !== "undefined" ? window.location?.hostname : null;

            // HTTPS 页面且 API 主机 ≠ 页面主机 → 跳过，走同域 fallback
            // 典型场景：API=http://47.101.61.184:8080, 页面=https://aroultra.shsmu.edu.cn
            if (isHttpsPage && pageHost && apiUrl.hostname !== pageHost) {
                // 跳过，不从此推导
            } else {
                apiUrl.port = String(DEFAULT_SOCKET_PORT);
                if (isHttpsPage) {
                    apiUrl.protocol = "https:";
                }
                return apiUrl.origin;
            }
        } catch {
            /* fall through */
        }
    }

    // ③ 当前页同域
    if (typeof window !== "undefined" && window.location?.hostname) {
        if (isHttpsPage) {
            // HTTPS：不设端口，nginx 按 /socket.io/ 路径代理
            return `${window.location.protocol}//${window.location.hostname}`;
        }
        return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_SOCKET_PORT}`;
    }

    // ④ 开发环境 localhost
    return `http://localhost:${DEFAULT_SOCKET_PORT}`;
}

// ── 共享 Socket 单例 ──
// 模块级同步创建——在 React 渲染之前，消除初始化顺序问题。
// Socket 实例永不替换，避免监听器重新绑定问题。
// Token 刷新通过 reconnect_attempt 钩子更新 query 参数。

function initSharedSocket(): Socket {
    const token = authStorage.getToken();
    return io(resolveSocketUrl(), {
        ...SOCKET_IO_CLIENT_OPTIONS,
        query: { token: token || '', v: APP_BUILD_ID },
    });
}

const sharedSocket: Socket = initSharedSocket();

/** 获取全局共享 Socket 实例。永不返回 null——socket 在模块加载时即创建。 */
export function getSharedSocket(): Socket {
    return sharedSocket;
}

// ── 重连时预刷新 token ──
sharedSocket.on('reconnect_attempt', (attempt) => {
    console.log(`[SharedSocket] 第 ${attempt} 次重连尝试…`);
    const currentToken = authStorage.getToken();
    if (currentToken) {
        (sharedSocket as any).io.opts.query = {
            token: currentToken,
            v: APP_BUILD_ID,
        };
    }
});

// ── ROOM_ACK 看门狗：room 成员资格自愈 ──
// 服务端在 room 分配完成后推送 ROOM_ACK。若连接建立后迟迟收不到 ACK
// （例如服务端重启窗口期内握手、room 分配被跳过），主动发 ROOM_RESYNC
// 请求重新分配；重试仍无响应则强制重建连接。稳态开销为零（每次连接一帧）。

const ROOM_ACK_TIMEOUT_MS = 5000;
const ROOM_RESYNC_MAX_RETRY = 2;

/** 最近一次 ROOM_ACK 携带的服务端 bootId；null 表示尚未收到过 ACK */
let lastAckBootId: string | null = null;
let ackWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
let resyncRetryCount = 0;
let ackReceivedForThisConnection = false;
/** 强制重连冷却：防止 bootId 误判（如多实例误配）导致重连风暴 */
let lastForceReconnectAt = 0;
const FORCE_RECONNECT_COOLDOWN_MS = 60000;

export function getLastAckBootId(): string | null {
    return lastAckBootId;
}

/** 强制重建 Socket.IO 连接（重新握手 → 重新分配 room）。供轮询兜底调用。 */
export function forceSocketReconnect(reason: string): void {
    const now = Date.now();
    if (now - lastForceReconnectAt < FORCE_RECONNECT_COOLDOWN_MS) {
        console.warn(`[SharedSocket] 强制重连请求被冷却期拦截（${reason}）`);
        return;
    }
    lastForceReconnectAt = now;
    console.warn(`[SharedSocket] 强制重连：${reason}`);
    clearAckWatchdog();
    resyncRetryCount = 0;
    sharedSocket.disconnect();
    sharedSocket.connect();
}

function clearAckWatchdog(): void {
    if (ackWatchdogTimer) {
        clearTimeout(ackWatchdogTimer);
        ackWatchdogTimer = null;
    }
}

function startAckWatchdog(): void {
    clearAckWatchdog();
    ackWatchdogTimer = setTimeout(() => {
        if (ackReceivedForThisConnection || !sharedSocket.connected) return;
        if (resyncRetryCount < ROOM_RESYNC_MAX_RETRY) {
            resyncRetryCount++;
            console.warn(`[SharedSocket] ${ROOM_ACK_TIMEOUT_MS}ms 未收到 ROOM_ACK，发送 ROOM_RESYNC（第 ${resyncRetryCount} 次）`);
            sharedSocket.emit('ROOM_RESYNC', {});
            startAckWatchdog();
        } else {
            forceSocketReconnect(`ROOM_RESYNC 重试 ${ROOM_RESYNC_MAX_RETRY} 次后仍未收到 ROOM_ACK`);
        }
    }, ROOM_ACK_TIMEOUT_MS);
}

sharedSocket.on('connect', () => {
    ackReceivedForThisConnection = false;
    resyncRetryCount = 0;
    startAckWatchdog();
});

sharedSocket.on('ROOM_ACK', (payload: { bootId?: string; rooms?: string[] }) => {
    ackReceivedForThisConnection = true;
    resyncRetryCount = 0;
    clearAckWatchdog();
    if (payload?.bootId) {
        lastAckBootId = String(payload.bootId);
    }
    console.log(`[SharedSocket] ROOM_ACK bootId=${payload?.bootId} rooms=${payload?.rooms?.join(',')}`);
});

sharedSocket.on('disconnect', () => {
    clearAckWatchdog();
});
