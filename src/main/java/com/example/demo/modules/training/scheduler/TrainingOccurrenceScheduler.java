package com.example.demo.modules.training.scheduler;

import com.example.demo.modules.training.entity.Training;
import com.example.demo.modules.training.mapper.TrainingMapper;
import com.example.demo.modules.training.service.TrainingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/** 每天 17:00 为带循环规则的已发布培训自动补齐未来 28 天场次（小表遍历，无 N+1）。 */
@Component
public class TrainingOccurrenceScheduler {

    private static final Logger log = LoggerFactory.getLogger(TrainingOccurrenceScheduler.class);

    private final TrainingMapper trainingMapper;
    private final TrainingService trainingService;

    public TrainingOccurrenceScheduler(TrainingMapper trainingMapper, TrainingService trainingService) {
        this.trainingMapper = trainingMapper;
        this.trainingService = trainingService;
    }

    @Scheduled(cron = "0 17 * * * ?")
    public void generateRecurringOccurrences() {
        List<Training> recurrences = trainingMapper.listWithRecurrence();
        int total = 0;
        for (Training t : recurrences) {
            try {
                total += trainingService.generateOccurrences(t.getId());
            } catch (Exception e) {
                log.error("[training-recurrence] 培训 {} 生成场次失败: {}", t.getId(), e.getMessage());
            }
        }
        if (total > 0) log.info("[training-recurrence] 自动生成场次 {} 条（{} 个系列）", total, recurrences.size());
    }
}
