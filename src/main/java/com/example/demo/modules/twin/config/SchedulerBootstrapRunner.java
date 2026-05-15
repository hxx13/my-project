package com.example.demo.modules.twin.config;

import com.example.demo.modules.twin.service.JobSchedulerService;
import com.example.demo.modules.twin.service.TwinFreezeConfigService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class SchedulerBootstrapRunner implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(SchedulerBootstrapRunner.class);
    private final JobSchedulerService jobSchedulerService;
    private final TwinFreezeConfigService twinFreezeConfigService;

    public SchedulerBootstrapRunner(JobSchedulerService jobSchedulerService,
                                    TwinFreezeConfigService twinFreezeConfigService) {
        this.jobSchedulerService = jobSchedulerService;
        this.twinFreezeConfigService = twinFreezeConfigService;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            // 开机先对齐冻结相关任务时刻，再做错过任务补跑自检。
            Map<String, Object> cfg = twinFreezeConfigService.getConfigMap();
            boolean enabled = Boolean.TRUE.equals(cfg.get("enabled"));
            String freezeTime = cfg.get("freezeTime") == null ? "18:00" : String.valueOf(cfg.get("freezeTime"));
            String secondFreezeTime = cfg.get("secondFreezeTime") == null ? "" : String.valueOf(cfg.get("secondFreezeTime"));
            jobSchedulerService.syncFreezeJobs(enabled, freezeTime, secondFreezeTime, "system-bootstrap");
            jobSchedulerService.bootstrapCatchup();
            log.info("[schedule] bootstrap self-check completed (freeze jobs aligned, missed jobs caught up)");
        } catch (Exception e) {
            log.error("[schedule] bootstrap catchup failed: {}", e.getMessage());
        }
    }
}
