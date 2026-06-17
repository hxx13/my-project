import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { resolveSocketUrl, SOCKET_IO_CLIENT_OPTIONS } from "@/config/socketUrl";
import { authStorage } from "@/features/auth/authStorage";

export const useSocket = () => {
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        const token = authStorage.getToken();
        if (!token) return; // 未登录不建立连接，避免服务端拒绝
        const socketInstance = io(resolveSocketUrl(), {
            ...SOCKET_IO_CLIENT_OPTIONS,
            query: { token },
        });
        setSocket(socketInstance);

        socketInstance.on('connect', () => {
            console.log('🟢 [WebSocket] 成功接入孪生事件总线! ID:', socketInstance.id);
        });

        socketInstance.on('disconnect', (reason) => {
            console.warn('🔴 [WebSocket] 连接断开，原因:', reason);
        });

        socketInstance.on('connect_error', (err) => {
            console.error('❌ [WebSocket] 连接失败:', err.message);
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
    }, []);

    return socket;
};