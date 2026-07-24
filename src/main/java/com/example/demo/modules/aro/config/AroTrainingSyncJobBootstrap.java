package com.example.demo.modules.aro.config;

import com.example.demo.modules.twin.common.service.JobExecutionRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 注册 ARO 培训数据同步定时任务到统一调度表。
 * 每天凌晨 02:30 执行，可在 /admin/settings/scheduler 调整。
 */
@Component
public class AroTrainingSyncJobBootstrap {

    private static final Logger log = LoggerFactory.getLogger(AroTrainingSyncJobBootstrap.class);
    private final JdbcTemplate jdbcTemplate;

    public AroTrainingSyncJobBootstrap(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void registerJob() {
        try {
            jdbcTemplate.update(
                "INSERT IGNORE INTO twin_job_schedule_config (job_key, job_name, enabled, schedule_type, schedule_time, description, update_time) " +
                "VALUES (?, 'ARO培训同步', 1, 'DAILY', '02:30', 'ARO 培训数据同步（场次+学员缓存到本地表）', NOW())",
                JobExecutionRegistry.JOB_ARO_TRAINING_SYNC
            );
            log.info("[AroTrainingSync] 定时任务已注册: {}", JobExecutionRegistry.JOB_ARO_TRAINING_SYNC);
        } catch (Exception e) {
            log.warn("[AroTrainingSync] 注册定时任务失败（可能表尚未初始化）: {}", e.getMessage());
        }
    }
}
