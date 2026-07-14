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
 * 优先级：VITE_SOCKET_URL → 由 VITE_API_BASE_URL 改端口 → 当前页 host:9092 → localhost:9092
 */
export function resolveSocketUrl(): string {
    const explicit = import.meta.env.VITE_SOCKET_URL;
    if (typeof explicit === "string" && explicit.trim() !== "") {
        return explicit.trim();
    }

    const apiBase = import.meta.env.VITE_API_BASE_URL;
    if (typeof apiBase === "string" && apiBase.trim() !== "") {
        try {
            const u = new URL(apiBase.trim());
            u.port = String(DEFAULT_SOCKET_PORT);
            return u.origin;
        } catch {
            /* fall through */
        }
    }

    if (typeof window !== "undefined" && window.location?.hostname) {
        const { protocol, hostname } = window.location;
        return `${protocol}//${hostname}:${DEFAULT_SOCKET_PORT}`;
    }

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
