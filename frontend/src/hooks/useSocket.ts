import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { resolveSocketUrl, SOCKET_IO_CLIENT_OPTIONS, APP_BUILD_ID } from "@/config/socketUrl";
import { authStorage } from "@/features/auth/authStorage";
import { doRefresh } from "@/api/core/tokenRefresh";
import { fetchClientVersion } from '@/api/domains/clientVersion.api';

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

        // ── 每次重连前刷新 token ──
        // 断线超过 token 有效期后，重连时携带过期 token 会被服务端拒绝。
        // 此处预刷新确保每次重连都携带有效 token，无需依赖 connect_error 救火。
        socketInstance.on('reconnect_attempt', (attempt) => {
            console.log(`🔄 [WebSocket] 第 ${attempt} 次重连尝试…`);
            const currentToken = authStorage.getToken();
            if (currentToken) {
                (socketInstance as any).io.opts.query = {
                    token: currentToken,
                    v: APP_BUILD_ID,
                };
            }
        });

        socketInstance.on('connect_error', (err) => {
            const msg = (err?.message ?? '').toLowerCase();
            // 🔑 区分两类错误：
            //   ① 网络/服务器不可达 → 不干预，交给 Socket.IO 内置无限重连
            //   ② 认证失败（token 过期被服务端拒绝）→ 静默刷新 token，但不中断重连循环
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
                console.warn('🔴 [WebSocket] 连接失败（服务器不可达或网络波动），等待 Socket.IO 内置重连:', err.message);
                return; // ← 不 disconnect、不刷新 token，让 Socket.IO 自己重试
            }

            // 认证错误：token 可能已过期，尝试静默刷新
            console.warn('🔐 [WebSocket] 认证失败（token 可能过期）:', err.message);

            // 防止并发恢复
            if (recoveryInProgressRef.current) return;
            recoveryInProgressRef.current = true;
            recoveryAttemptRef.current += 1;

            // 安全阀：连续多次刷新均失败 → 强制登出
            if (recoveryAttemptRef.current > MAX_RECOVERY_ATTEMPTS) {
                console.error('[WebSocket] Token 恢复已达上限，触发强制登出');
                socketInstance.disconnect();
                window.dispatchEvent(new Event('AUTH_FORCE_LOGOUT'));
                recoveryInProgressRef.current = false;
                return;
            }

            // ⚠️ 关键修复：不调用 socketInstance.disconnect()
            // 之前的版本在这里 disconnect() 会杀死 Socket.IO 内置的无限重连循环，
            // 导致「断开超过几分钟就无法再连上」。
            // 现在只刷新 token 并更新 socket query，让重连循环自然进行。
            doRefresh().then((newToken) => {
                if (newToken) {
                    console.log('[WebSocket] Token 已刷新，更新重连参数');
                    recoveryAttemptRef.current = 0; // 新 token 应有效，重置计数器
                    // 更新 socket 实例的 query 参数，下次重连携带新 token
                    (socketInstance as any).io.opts.query = {
                        token: newToken,
                        v: APP_BUILD_ID,
                    };
                    // 触发一次主动连接（使用新 token）
                    socketInstance.connect();
                } else {
                    console.warn('[WebSocket] Token 刷新返回空，等待下次重连');
                    // 不登出 — Socket.IO 会继续重试，reconnect_attempt 钩子会再次尝试获取 token
                }
            }).catch(() => {
                console.warn('[WebSocket] Token 刷新网络异常，等待 Socket.IO 下次重连');
                // 不登出 — 保持连接循环，网络恢复后自动连上
            }).finally(() => {
                recoveryInProgressRef.current = false;
            });
        });

        socketInstance.on('reconnect', () => {
            console.log('🟢 [WebSocket] 重连成功! ID:', socketInstance.id);
            recoveryInProgressRef.current = false;
            recoveryAttemptRef.current = 0;

            // 重连后静默检查版本：如果此期间管理员触发了 reload，轮询通道会捕获，但这里做一次主动确认
            const clientId = (() => {
                try { return localStorage.getItem('__client_id') || ''; } catch { return ''; }
            })();
            fetchClientVersion(clientId, APP_BUILD_ID, 'web').then(resp => {
                const stored = sessionStorage.getItem('__last_reload_id');
                const lastReloadId = stored ? parseInt(stored, 10) : 0;
                if (resp.reloadId > lastReloadId) {
                    console.log('[WebSocket] 重连后发现 reloadId 递增，补触发刷新');
                    sessionStorage.setItem('__last_reload_id', String(resp.reloadId));
                    window.dispatchEvent(new CustomEvent('CLIENT_RELOAD_NEEDED', {
                        detail: { reason: 'admin-command' as const, payload: resp }
                    }));
                }
            }).catch(() => { /* 静默失败 */ });
        });

        socketInstance.on('reconnect_error', (err) => {
            console.warn('⚠️ [WebSocket] 重连尝试失败:', err.message);
        });

        const handleForceLogout = () => {
            console.log("[WebSocket] 收到强制登出信号，断开连接");
            socketInstance.disconnect();
        };
        window.addEventListener("AUTH_FORCE_LOGOUT", handleForceLogout);

        // ── 页面恢复可见时立即重连 ──
        // 后台标签页 setTimeout 节流会导致重连退避极度缓慢。
        // 用户切回标签页时立即尝试重连，避免错过广播事件。
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !socketInstance.connected) {
                console.log("[WebSocket] 页面恢复可见，立即尝试重连…");
                socketInstance.connect();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("AUTH_FORCE_LOGOUT", handleForceLogout);
            socketInstance.disconnect();
        };
    }, [socketEpoch]);

    return socket;
};