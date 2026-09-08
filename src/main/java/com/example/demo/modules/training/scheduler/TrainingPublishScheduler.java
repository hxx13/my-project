package com.example.demo.modules.training.scheduler;

import com.example.demo.modules.training.mapper.TrainingMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 每分钟将到点的定时发布培训转为 PUBLISHED（单条 SQL，无 N+1）。 */
@Component
public class TrainingPublishScheduler {

    private static final Logger log = LoggerFactory.getLogger(TrainingPublishScheduler.class);

    private final TrainingMapper trainingMapper;

    public TrainingPublishScheduler(TrainingMapper trainingMapper) {
        this.trainingMapper = trainingMapper;
    }

    @Scheduled(cron = "0 * * * * ?")
    public void publishDue() {
        try {
            int rows = trainingMapper.publishDue();
            if (rows > 0) log.info("[training-publish] 定时发布 {} 条", rows);
        } catch (Exception e) {
            log.error("[training-publish] 定时发布失败: {}", e.getMessage());
        }
    }
}
