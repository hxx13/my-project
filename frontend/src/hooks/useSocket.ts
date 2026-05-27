import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { resolveSocketUrl, SOCKET_IO_CLIENT_OPTIONS } from "@/config/socketUrl";

export const useSocket = () => {
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        const socketInstance = io(resolveSocketUrl(), SOCKET_IO_CLIENT_OPTIONS);

        // 2. 状态监听雷达
        socketInstance.on('connect', () => {
            console.log('🟢 [WebSocket] 成功接入孪生事件总线! ID:', socketInstance.id);
        });

        socketInstance.on('disconnect', (reason) => {
            console.warn('🔴 [WebSocket] 连接断开，原因:', reason);
        });

        socketInstance.on('connect_error', (err) => {
            console.error('❌ [WebSocket] 连接失败:', err.message);
        });

        setSocket(socketInstance);

        // 3. 卸载销毁：防止 React 严格模式导致的多重连接内存泄漏
        return () => {
            socketInstance.disconnect();
        };
    }, []);

    return socket;
};