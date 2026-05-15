/** Socket.IO 与 Spring HTTP 分端口时，默认把 API 端口换为 9092 */
const DEFAULT_SOCKET_PORT = 9092;

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
