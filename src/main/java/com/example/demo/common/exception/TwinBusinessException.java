package com.example.demo.common.exception;

import lombok.Getter;

/**
 * 可预期业务异常，由 {@link com.example.demo.common.web.GlobalExceptionHandler} 转为 Result。
 */
@Getter
public class TwinBusinessException extends RuntimeException {

    private final int code;

    public TwinBusinessException(int code, String message) {
        super(message);
        this.code = code;
    }

    public static TwinBusinessException of(int code, String message) {
        return new TwinBusinessException(code, message);
    }
}
