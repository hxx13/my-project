package com.example.demo.common.config;

import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.listener.ExceptionListenerAdapter;
import io.netty.channel.ChannelHandlerContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.SocketException;
import java.nio.channels.ClosedChannelException;
import java.util.List;

/**
 * 客户端断开、半关闭连接时 Netty 常抛出 {@link IOException}；默认 {@code DefaultExceptionListener}
 * 以 ERROR 打全栈，且在 Windows 控制台编码下中文消息会变成 {@code ??????}。
 * 此处对典型「连接已结束」类异常静默处理，其余仅打一行 WARN（无 stack）。
 */
@SuppressWarnings("rawtypes")
final class QuietSocketIoExceptionListener extends ExceptionListenerAdapter {

    private static final Logger log = LoggerFactory.getLogger(QuietSocketIoExceptionListener.class);

    private static boolean isBenignNetworkThrowable(Throwable t) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (c instanceof ClosedChannelException) {
                return true;
            }
            if (c instanceof SocketException) {
                return true;
            }
            if (c instanceof IOException) {
                return true;
            }
        }
        return false;
    }

    @Override
    public void onEventException(Exception e, List args, SocketIOClient client) {
        /* 业务事件内异常：单行 WARN，避免默认 ERROR+全栈刷屏 */
        log.warn("[SocketIO] event handler: {}", e.toString());
    }

    @Override
    public void onDisconnectException(Exception e, SocketIOClient client) {
        /* 断开阶段几乎均为对端关闭 */
    }

    @Override
    public void onConnectException(Exception e, SocketIOClient client) {
        if (!isBenignNetworkThrowable(e)) {
            log.warn("[SocketIO] connect exception: {}", e.toString());
        }
    }

    @Override
    public void onPingException(Exception e, SocketIOClient client) {
        if (!isBenignNetworkThrowable(e)) {
            log.warn("[SocketIO] ping exception: {}", e.toString());
        }
    }

    @Override
    public void onPongException(Exception e, SocketIOClient client) {
        if (!isBenignNetworkThrowable(e)) {
            log.warn("[SocketIO] pong exception: {}", e.toString());
        }
    }

    @Override
    public boolean exceptionCaught(ChannelHandlerContext ctx, Throwable e) throws Exception {
        if (!isBenignNetworkThrowable(e)) {
            log.warn("[SocketIO] pipeline exception: {}", e.toString());
        }
        return true;
    }
}
