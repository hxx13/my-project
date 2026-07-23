import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getSharedSocket, APP_BUILD_ID } from "@/config/socketUrl";
import { authStorage } from "@/features/auth/authStorage";
import { doRefresh } from "@/api/core/tokenRefresh";

export const useSocket = () => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const recoveryInProgressRef = useRef(false);
    const recoveryAttemptRef = useRef(0);
    const MAX_RECOVERY_ATTEMPTS = 3;

    useEffect(() => {
        const token = authStorage.getToken();
        if (!token) return;
        const socketInstance = getSharedSocket();
        setSocket(socketInstance);

        // ── 命名处理函数（用于 cleanup 时精确移除）──
        const onConnect = () => {
            console.log('🟢 [WebSocket] 成功接入孪生事件总线! ID:', socketInstance.id);
            recoveryInProgressRef.current = false;
            recoveryAttemptRef.current = 0;
        };

        const onDisconnect = (reason: string) => {
            console.warn('🔴 [WebSocket] 连接断开，将持续重连。原因:', reason);
        };

        const onConnectError = (err: any) => {
            const msg = (err?.message ?? '').toLowerCase();
            const isAuthError =
                msg.includes('not authorized') ||
                msg.includes('unauthorized') ||
                msg.includes('websocket error') ||
                msg.includes('transport error') ||
                (err as any)?.data === 'not authorized';

            if (!isAuthError) {
                console.warn('🔴 [WebSocket] 连接失败（服务器不可达或网络波动），等待 Socket.IO 内置重连:', err.message);
                return;
            }

            console.warn('🔐 [WebSocket] 认证失败（token 可能过期）:', err.message);
            if (recoveryInProgressRef.current) return;
            recoveryInProgressRef.current = true;
            recoveryAttemptRef.current += 1;

            if (recoveryAttemptRef.current > MAX_RECOVERY_ATTEMPTS) {
                console.error('[WebSocket] Token 恢复已达上限，触发强制登出');
                socketInstance.disconnect();
                window.dispatchEvent(new Event('AUTH_FORCE_LOGOUT'));
                recoveryInProgressRef.current = false;
                return;
            }

            doRefresh().then((newToken) => {
                if (newToken) {
                    console.log('[WebSocket] Token 已刷新，更新重连参数');
                    recoveryAttemptRef.current = 0;
                    (socketInstance as any).io.opts.query = {
                        token: newToken,
                        v: APP_BUILD_ID,
                    };
                    socketInstance.connect();
                } else {
                    console.warn('[WebSocket] Token 刷新返回空，等待下次重连');
                }
            }).catch(() => {
                console.warn('[WebSocket] Token 刷新网络异常，等待 Socket.IO 下次重连');
            }).finally(() => {
                recoveryInProgressRef.current = false;
            });
        };

        const onReconnect = () => {
            console.log('🟢 [WebSocket] 重连成功! ID:', socketInstance.id);
            recoveryInProgressRef.current = false;
            recoveryAttemptRef.current = 0;
        };

        const onReconnectError = (err: any) => {
            console.warn('⚠️ [WebSocket] 重连尝试失败:', err.message);
        };

        socketInstance.on('connect', onConnect);
        socketInstance.on('disconnect', onDisconnect);
        socketInstance.on('connect_error', onConnectError);
        socketInstance.on('reconnect', onReconnect);
        socketInstance.on('reconnect_error', onReconnectError);

        // ── DOM-level 处理函数 ──
        const handleForceLogout = () => {
            console.log("[WebSocket] 收到强制登出信号，断开连接");
            socketInstance.disconnect();
        };
        window.addEventListener("AUTH_FORCE_LOGOUT", handleForceLogout);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !socketInstance.connected) {
                console.log("[WebSocket] 页面恢复可见，立即尝试重连…");
                socketInstance.connect();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        // ── Cleanup：仅移除本实例注册的监听器，不断开共享 socket ──
        return () => {
            socketInstance.off('connect', onConnect);
            socketInstance.off('disconnect', onDisconnect);
            socketInstance.off('connect_error', onConnectError);
            socketInstance.off('reconnect', onReconnect);
            socketInstance.off('reconnect_error', onReconnectError);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("AUTH_FORCE_LOGOUT", handleForceLogout);
            // ⚠️ 不调用 socketInstance.disconnect() —— 这是共享 socket，
            // 断开它会杀死 GlobalSocketListener 和其他消费者的连接。
        };
    }, []);

    return socket;
};