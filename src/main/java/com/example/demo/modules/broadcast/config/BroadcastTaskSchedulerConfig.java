package com.example.demo.modules.broadcast.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * 广播模块独占线程池：保活重连与定时播出都走它，与 {@code spring.task.scheduling} 默认池隔离，
 * 避免挤占门禁/统一调度/大华那些既有 @Scheduled。仿 WinCcTelemetryTaskSchedulerConfig。
 */
@Configuration
public class BroadcastTaskSchedulerConfig {

    @Bean(name = "broadcastTaskScheduler")
    public ThreadPoolTaskScheduler broadcastTaskScheduler(
            @Value("${app.broadcast.scheduler.pool-size:2}") int poolSize,
            @Value("${app.broadcast.scheduler.thread-name-prefix:broadcast-}") String threadNamePrefix) {
        ThreadPoolTaskScheduler s = new ThreadPoolTaskScheduler();
        s.setPoolSize(Math.max(1, poolSize));
        s.setThreadNamePrefix(threadNamePrefix);
        s.setDaemon(true);
        s.setWaitForTasksToCompleteOnShutdown(true);
        s.setAwaitTerminationSeconds(30);
        return s;
    }
}
