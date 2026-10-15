package com.example.demo.modules.avidity.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * avidity 模块独占线程池，避免与门禁/大华/广播那些既有 @Scheduled 抢默认池。
 */
@Configuration
public class AvidityTaskSchedulerConfig {

    @Bean(name = "avidityTaskScheduler")
    public ThreadPoolTaskScheduler avidityTaskScheduler(
            @Value("${app.avidity.scheduler.pool-size:1}") int poolSize,
            @Value("${app.avidity.scheduler.thread-name-prefix:avidity-}") String threadNamePrefix) {
        ThreadPoolTaskScheduler s = new ThreadPoolTaskScheduler();
        s.setPoolSize(Math.max(1, poolSize));
        s.setThreadNamePrefix(threadNamePrefix);
        s.setDaemon(true);
        s.setWaitForTasksToCompleteOnShutdown(true);
        s.setAwaitTerminationSeconds(30);
        return s;
    }
}
