package com.example.demo.modules.twin.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration
public class TwinSwingTaskSchedulerConfig {

    @Bean(name = "twinSwingTaskScheduler", destroyMethod = "shutdown")
    public ThreadPoolTaskScheduler twinSwingTaskScheduler() {
        ThreadPoolTaskScheduler s = new ThreadPoolTaskScheduler();
        s.setPoolSize(4);
        s.setThreadNamePrefix("twin-swing-");
        s.initialize();
        return s;
    }
}
