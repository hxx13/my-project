package com.example.demo.modules.twin.task;

import com.example.demo.modules.twin.service.JobSchedulerService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class UnifiedScheduleDispatcher {
    private final JobSchedulerService jobSchedulerService;

    public UnifiedScheduleDispatcher(JobSchedulerService jobSchedulerService) {
        this.jobSchedulerService = jobSchedulerService;
    }

    @Scheduled(cron = "0 * * * * ?")
    public void dispatch() {
        jobSchedulerService.tick();
    }
}
