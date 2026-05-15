import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { resolveSocketUrl } from '@/config/socketUrl';

export const useSocket = () => {
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        const socketInstance = io(resolveSocketUrl(), {
            transports: ['websocket'], // 强制使用 websocket，拒绝 xhr 轮询降级
            autoConnect: true,
            reconnection: true,        // 断线自动重连
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
        });

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