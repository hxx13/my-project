package com.example.demo.modules.facerecognition.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * 人脸服务端比对专用线程池：多网页端并发 verify 时排队执行，避免 Tomcat 线程无限阻塞在 DJL 推理上。
 */
@Configuration
public class FaceInferenceConfig {

    @Bean(name = "faceInferenceExecutor")
    public Executor faceInferenceExecutor(
            @Value("${app.face.inference.pool-core:2}") int corePoolSize,
            @Value("${app.face.inference.pool-max:4}") int maxPoolSize,
            @Value("${app.face.inference.queue-capacity:32}") int queueCapacity) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(Math.max(1, corePoolSize));
        executor.setMaxPoolSize(Math.max(corePoolSize, maxPoolSize));
        executor.setQueueCapacity(Math.max(8, queueCapacity));
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setThreadNamePrefix("face-infer-");
        executor.initialize();
        return executor;
    }
}
