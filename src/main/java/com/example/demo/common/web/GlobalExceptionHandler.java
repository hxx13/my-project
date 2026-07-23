package com.example.demo.common.web;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.aro.exception.AroTokenRequiredException;
import com.example.demo.modules.knowledge.service.KnowledgeCategoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Locale;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** 安全扫描/爬虫常见探测路径，不必以 WARN 刷屏 */
    private static boolean isBenignProbePath(String path) {
        if (path == null || path.isBlank()) {
            return true;
        }
        String p = path.trim().replace('\\', '/').toLowerCase(Locale.ROOT);
        if (p.contains(".env") || p.contains(".git") || p.contains("web.config") || p.contains("wp-")) {
            return true;
        }
        if (p.startsWith("sdk/") || p.endsWith("/sdk/weblanguage") || p.contains("phpmyadmin")) {
            return true;
        }
        return p.equals(".ds_store") || p.contains("/.well-known/");
    }

    @ExceptionHandler(TwinBusinessException.class)
    public Result<Void> handleTwinBusiness(TwinBusinessException ex) {
        return Result.fail(ex.getCode(), ex.getMessage());
    }

    @ExceptionHandler(AroTokenRequiredException.class)
    public Result<Void> handleAroTokenRequired(AroTokenRequiredException ex) {
        return Result.fail(ex.getCode(), ex.getMessage());
    }

    @ExceptionHandler(KnowledgeCategoryService.KnowledgeException.class)
    public Result<Void> handleKnowledge(KnowledgeCategoryService.KnowledgeException ex) {
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

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public Result<Void> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
        String uri = request.getRequestURI();
        String supported = ex.getSupportedHttpMethods() != null
                ? ex.getSupportedHttpMethods().toString()
                : "";
        log.warn("HTTP method not supported: {} {} (supported: {})", ex.getMethod(), uri, supported);
        return Result.fail(
                ErrorCodeConstants.BAD_REQUEST,
                "请求方法不支持: " + ex.getMethod() + " " + uri
                        + (supported.isEmpty() ? "" : "，请使用 " + supported));
    }

    @ExceptionHandler(AsyncRequestTimeoutException.class)
    public Result<Void> handleAsyncTimeout(
            AsyncRequestTimeoutException ex, HttpServletRequest request, HttpServletResponse response) {
        if (response.isCommitted()) {
            log.debug("Async timeout on committed response: {} {}", request.getMethod(), request.getRequestURI());
            return null;
        }
        String accept = request.getHeader("Accept");
        if (accept != null && accept.contains(MediaType.TEXT_EVENT_STREAM_VALUE)) {
            log.debug("SSE async timeout: {}", request.getRequestURI());
            return null;
        }
        log.warn("Async request timeout: {} {}", request.getMethod(), request.getRequestURI());
        return Result.fail(ErrorCodeConstants.INTERNAL_ERROR, "请求处理超时，请稍后重试");
    }

    /** 静态资源 404 须返回空 body + 404，不能 JSON（否则 module script MIME 报错） */
    private static boolean isStaticAssetPath(String path) {
        if (path == null || path.isBlank()) {
            return false;
        }
        String p = path.trim().replace('\\', '/');
        if (p.startsWith("/assets/") || p.startsWith("/models/") || p.equals("/favicon.svg") || p.equals("/index.html")) {
            return true;
        }
        return p.endsWith(".js") || p.endsWith(".css") || p.endsWith(".wasm") || p.endsWith(".map")
                || p.endsWith(".svg") || p.endsWith(".ico");
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<?> handleNoResource(NoResourceFoundException ex) {
        String path = ex.getResourcePath();
        if (isStaticAssetPath(path)) {
            if (log.isDebugEnabled()) {
                log.debug("Static resource not found: {} {}", ex.getHttpMethod(), path);
            }
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        if (isBenignProbePath(path)) {
            if (log.isTraceEnabled()) {
                log.trace("Ignored probe: {} {}", ex.getHttpMethod(), path);
            }
        } else {
            log.debug("No resource: {} {}", ex.getHttpMethod(), path);
        }
        if ("login".equals(path) || "/login".equals(path)) {
            return ResponseEntity.badRequest().body(Result.error("请使用 POST /api/auth/login/web 登录"));
        }
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Result.fail(ErrorCodeConstants.NOT_FOUND, "接口不存在: " + ex.getHttpMethod() + " " + path));
    }

    @ExceptionHandler(Exception.class)
    public Result<Void> handleUnexpected(Exception ex, HttpServletRequest request, HttpServletResponse response) {
        if (response.isCommitted()) {
            log.debug("Exception after response committed: {} {} — {}", request.getMethod(), request.getRequestURI(), ex.getClass().getSimpleName());
            return null;
        }
        String accept = request.getHeader("Accept");
        if (accept != null && accept.contains(MediaType.TEXT_EVENT_STREAM_VALUE)) {
            log.debug("Exception on SSE stream {}: {}", request.getRequestURI(), ex.getClass().getSimpleName());
            return null;
        }
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
