package com.example.demo.common.web;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(TwinBusinessException.class)
    public Result<Void> handleTwinBusiness(TwinBusinessException ex) {
        return Result.fail(ex.getCode(), ex.getMessage());
    }

    @ExceptionHandler({
            MethodArgumentNotValidException.class,
            BindException.class,
            IllegalArgumentException.class,
            MethodArgumentTypeMismatchException.class,
            HttpMessageNotReadableException.class
    })
    public Result<Void> handleBadRequest(Exception ex) {
        String message = resolveValidationMessage(ex);
        return Result.fail(ErrorCodeConstants.BAD_REQUEST, message);
    }

    @ExceptionHandler(Exception.class)
    public Result<Void> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return Result.fail(ErrorCodeConstants.INTERNAL_ERROR, "服务繁忙，请稍后重试");
    }

    private static String resolveValidationMessage(Exception ex) {
        if (ex instanceof MethodArgumentNotValidException manv
                && manv.getBindingResult().getFieldError() != null) {
            return manv.getBindingResult().getFieldError().getDefaultMessage();
        }
        if (ex instanceof BindException bind && bind.getFieldError() != null) {
            return bind.getFieldError().getDefaultMessage();
        }
        return ex.getMessage() != null ? ex.getMessage() : "请求参数错误";
    }
}
