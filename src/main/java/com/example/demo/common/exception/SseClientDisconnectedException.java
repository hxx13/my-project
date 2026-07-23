package com.example.demo.common.exception;

/**
 * 表示 SSE 客户端已断开连接（非服务端错误），调用方应静默终止流。
 */
public class SseClientDisconnectedException extends RuntimeException {

    public SseClientDisconnectedException(String message) {
        super(message);
    }

    public SseClientDisconnectedException(String message, Throwable cause) {
        super(message, cause);
    }

    /** 异常链中是否包含 SSE 客户端主动断开（非服务端故障）。 */
    public static boolean isClientDisconnect(Throwable throwable) {
        Throwable cursor = throwable;
        while (cursor != null) {
            if (cursor instanceof SseClientDisconnectedException) {
                return true;
            }
            cursor = cursor.getCause();
        }
        return false;
    }
}
