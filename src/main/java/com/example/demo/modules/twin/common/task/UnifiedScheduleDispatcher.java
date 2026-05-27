package com.example.demo.modules.twin.common.task;

import com.example.demo.modules.twin.common.service.JobSchedulerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class UnifiedScheduleDispatcher {
    private static final Logger log = LoggerFactory.getLogger(UnifiedScheduleDispatcher.class);
    private final JobSchedulerService jobSchedulerService;

    public UnifiedScheduleDispatcher(JobSchedulerService jobSchedulerService) {
        this.jobSchedulerService = jobSchedulerService;
    }

    @Scheduled(cron = "0 * * * * ?")
    public void dispatch() {
        try {
            jobSchedulerService.tick();
        } catch (Throwable t) {
            log.error("[统一调度] 定时节拍异常，已捕获防止调度线程终止", t);
        }
    }
}
