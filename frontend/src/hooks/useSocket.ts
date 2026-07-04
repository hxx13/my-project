import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { resolveSocketUrl, SOCKET_IO_CLIENT_OPTIONS, APP_BUILD_ID } from "@/config/socketUrl";
import { authStorage } from "@/features/auth/authStorage";
import { doRefresh } from "@/api/core/tokenRefresh";

export const useSocket = () => {
    const [socket, setSocket] = useState<Socket | null>(null);
    // Token 过期恢复：connect_error 时刷新 token 并触发 socket 重建
    const [socketEpoch, setSocketEpoch] = useState(0);
    const recoveryInProgressRef = useRef(false);
    const recoveryAttemptRef = useRef(0);
    const MAX_RECOVERY_ATTEMPTS = 3;

    useEffect(() => {
        const token = authStorage.getToken();
        if (!token) return; // 未登录不建立连接，避免服务端拒绝
        const socketInstance = io(resolveSocketUrl(), {
            ...SOCKET_IO_CLIENT_OPTIONS,
            query: { token, v: APP_BUILD_ID },
        });
        setSocket(socketInstance);

        socketInstance.on('connect', () => {
            console.log('🟢 [WebSocket] 成功接入孪生事件总线! ID:', socketInstance.id);
            recoveryInProgressRef.current = false;
            recoveryAttemptRef.current = 0;
        });

        socketInstance.on('disconnect', (reason) => {
            console.warn('🔴 [WebSocket] 连接断开，将持续重连。原因:', reason);
        });

        socketInstance.on('connect_error', (err) => {
            const msg = (err?.message ?? '').toLowerCase();
            // 🔑 区分两类错误：
            //   ① 网络/服务器不可达 → 不干预，交给 Socket.IO 内置无限重连
            //   ② 认证失败（token 过期被服务端拒绝）→ 刷新 token 后重建
            const isAuthError =
                msg.includes('not authorized') ||
                msg.includes('unauthorized') ||
                (err as any)?.data === 'not authorized';

            if (!isAuthError) {
                console.warn('🔴 [WebSocket] 连接失败（服务器不可达或网络波动），等待 Socket.IO 内置重连:', err.message);
                return; // ← 不 disconnect、不刷新 token，让 Socket.IO 自己重试
            }

            // 认证错误：服务端明确拒绝了 token
            console.error('🔐 [WebSocket] 认证失败:', err.message);
            if (recoveryInProgressRef.current) return;
            if (recoveryAttemptRef.current >= MAX_RECOVERY_ATTEMPTS) {
                console.error('[WebSocket] Token 恢复已达上限，触发强制登出');
                socketInstance.disconnect();
                window.dispatchEvent(new Event('AUTH_FORCE_LOGOUT'));
                return;
            }
            recoveryInProgressRef.current = true;
            recoveryAttemptRef.current += 1;
            socketInstance.disconnect();
            // 尝试刷新 token，成功后触发 effect 重建 socket
            doRefresh().then((newToken) => {
                if (newToken) {
                    console.log('[WebSocket] Token 已刷新，用新 token 重建连接');
                    setSocketEpoch((e) => e + 1);
                } else {
                    console.warn('[WebSocket] Token 刷新失败，触发强制登出');
                    window.dispatchEvent(new Event('AUTH_FORCE_LOGOUT'));
                }
            }).catch(() => {
                console.warn('[WebSocket] Token 刷新异常，触发强制登出');
                window.dispatchEvent(new Event('AUTH_FORCE_LOGOUT'));
            }).finally(() => {
                recoveryInProgressRef.current = false;
            });
        });

        socketInstance.on('reconnect_attempt', (attempt) => {
            console.log(`🔄 [WebSocket] 第 ${attempt} 次重连尝试…`);
        });

        socketInstance.on('reconnect', () => {
            console.log('🟢 [WebSocket] 重连成功! ID:', socketInstance.id);
            recoveryInProgressRef.current = false;
            recoveryAttemptRef.current = 0;
        });

        socketInstance.on('reconnect_error', (err) => {
            console.warn('⚠️ [WebSocket] 重连尝试失败:', err.message);
        });

        const handleForceLogout = () => {
            console.log("[WebSocket] 收到强制登出信号，断开连接");
            socketInstance.disconnect();
        };
        window.addEventListener("AUTH_FORCE_LOGOUT", handleForceLogout);

        return () => {
            window.removeEventListener("AUTH_FORCE_LOGOUT", handleForceLogout);
            socketInstance.disconnect();
        };
    }, [socketEpoch]);

    return socket;
};