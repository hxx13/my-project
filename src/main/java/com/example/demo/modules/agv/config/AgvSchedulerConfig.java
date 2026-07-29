package com.example.demo.modules.agv.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * AGV 采集专用线程池，与默认 @Scheduled 池隔离，避免高频采集抢占管理后台请求。
 */
@Configuration
public class AgvSchedulerConfig {

    @Bean(name = "agvTaskScheduler")
    public TaskScheduler agvTaskScheduler() {
        ThreadPoolTaskScheduler ts = new ThreadPoolTaskScheduler();
        ts.setPoolSize(1);
        ts.setThreadNamePrefix("agv-collector-");
        ts.setWaitForTasksToCompleteOnShutdown(true);
        ts.setAwaitTerminationSeconds(15);
        return ts;
    }
}
