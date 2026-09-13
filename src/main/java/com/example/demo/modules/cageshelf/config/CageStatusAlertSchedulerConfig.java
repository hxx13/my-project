package com.example.demo.modules.cageshelf.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * 笼位状态告警扫描专用线程池，与默认 @Scheduled 池隔离，避免全量折叠审计流占用管理后台请求线程。
 */
@Configuration
public class CageStatusAlertSchedulerConfig {

    @Bean(name = "cageStatusAlertTaskScheduler")
    public TaskScheduler cageStatusAlertTaskScheduler() {
        ThreadPoolTaskScheduler ts = new ThreadPoolTaskScheduler();
        ts.setPoolSize(1);
        ts.setThreadNamePrefix("cage-status-alert-");
        ts.setWaitForTasksToCompleteOnShutdown(true);
        ts.setAwaitTerminationSeconds(15);
        return ts;
    }
}
