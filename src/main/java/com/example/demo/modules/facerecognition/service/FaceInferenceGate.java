package com.example.demo.modules.facerecognition.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;

import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executor;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * 将整段人脸比对提交到 {@code faceInferenceExecutor}，带超时与队列饱和保护。
 */
@Service
public class FaceInferenceGate {

    private static final Logger log = LoggerFactory.getLogger(FaceInferenceGate.class);

    private final Executor faceInferenceExecutor;

    @Value("${app.face.inference.verify-timeout-ms:120000}")
    private long verifyTimeoutMs;

    public FaceInferenceGate(@Qualifier("faceInferenceExecutor") Executor faceInferenceExecutor) {
        this.faceInferenceExecutor = faceInferenceExecutor;
    }

    public <T> T runVerify(Callable<T> task) throws Exception {
        Future<T> future;
        try {
            if (!(faceInferenceExecutor instanceof ThreadPoolTaskExecutor tpe)) {
                throw new IllegalStateException("faceInferenceExecutor 未配置为 ThreadPoolTaskExecutor");
            }
            future = tpe.submit(task);
        } catch (RejectedExecutionException e) {
            log.warn("[FaceInferenceGate] 队列已满，拒绝 verify 请求");
            throw new IllegalStateException("人脸比对繁忙，请稍后重试");
        }
        try {
            return future.get(verifyTimeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new IllegalStateException("人脸比对超时（队列等待或推理过久）");
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception ex) {
                throw ex;
            }
            throw new IllegalStateException(cause != null ? cause.getMessage() : "人脸比对失败");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("人脸比对被中断");
        }
    }

    /** 供管理端观测队列深度（可选） */
    public int queueSize() {
        if (faceInferenceExecutor instanceof ThreadPoolTaskExecutor tpe) {
            return tpe.getThreadPoolExecutor().getQueue().size();
        }
        return -1;
    }
}
