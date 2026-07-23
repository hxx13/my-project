package com.example.demo.modules.telemetry.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * WinCC 遥测定时任务<strong>独占</strong>线程池，与 {@code spring.task.scheduling} 默认池隔离，
 * 避免几千点 POST /Values 长时间占用与门禁/统一调度等 {@code @Scheduled} 争抢线程导致卡顿。
 */
@Configuration
@ConditionalOnProperty(prefix = "app.wincc", name = "enabled", havingValue = "true")
public class WinCcTelemetryTaskSchedulerConfig {

    @Bean(name = "winCcTelemetryTaskScheduler")
    public ThreadPoolTaskScheduler winCcTelemetryTaskScheduler(
            @Value("${app.wincc.scheduler.pool-size:1}") int poolSize,
            @Value("${app.wincc.scheduler.thread-name-prefix:wincc-telemetry-}") String threadNamePrefix) {
        ThreadPoolTaskScheduler s = new ThreadPoolTaskScheduler();
        s.setPoolSize(Math.max(1, poolSize));
        s.setThreadNamePrefix(threadNamePrefix);
        s.setDaemon(true);
        s.setWaitForTasksToCompleteOnShutdown(true);
        s.setAwaitTerminationSeconds(30);
        return s;
    }
}
