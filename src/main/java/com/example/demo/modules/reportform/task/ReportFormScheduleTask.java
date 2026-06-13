package com.example.demo.modules.reportform.task;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * 周期调度任务：每天 00:00 检查需要自动生成填报实例的已发布表单。
 * 为周期模式（daily/weekly/monthly）且在当前时间窗口内的表单自动创建空提交记录。
 */
@Component
public class ReportFormScheduleTask {

    private static final Logger log = LoggerFactory.getLogger(ReportFormScheduleTask.class);

    private final ReportFormDefinitionMapper definitionMapper;
    private final ReportFormSubmissionMapper submissionMapper;
    private final ObjectMapper objectMapper;

    public ReportFormScheduleTask(ReportFormDefinitionMapper definitionMapper,
                                   ReportFormSubmissionMapper submissionMapper,
                                   ObjectMapper objectMapper) {
        this.definitionMapper = definitionMapper;
        this.submissionMapper = submissionMapper;
        this.objectMapper = objectMapper;
    }

    /**
     * 每天 00:00 执行周期调度检查。
     */
    @Scheduled(cron = "0 0 0 * * ?")
    public void checkAndCreatePeriodicInstances() {
        log.info("[report-form] 周期调度开始");
        List<ReportFormDefinition> published = definitionMapper.selectPage().stream()
                .filter(f -> "published".equals(f.getStatus()))
                .toList();

        for (ReportFormDefinition form : published) {
            try {
                processForm(form);
            } catch (Exception e) {
                log.warn("[report-form] 周期调度处理失败 form={}: {}", form.getId(), e.getMessage());
            }
        }
        log.info("[report-form] 周期调度完成，已检查 {} 个已发布表单", published.size());
    }

    private void processForm(ReportFormDefinition form) {
        if (form.getScheduleJson() == null || form.getScheduleJson().isBlank()) return;

        try {
            var schedule = objectMapper.readTree(form.getScheduleJson());
            String period = schedule.has("period") ? schedule.get("period").asText() : "manual";
            if ("manual".equals(period)) return;

            // 检查今天是否匹配周期
            if (!matchesToday(period, schedule)) return;

            // 检查时间窗口
            String timeStart = schedule.has("timeWindowStart") ? schedule.get("timeWindowStart").asText() : null;
            String timeEnd = schedule.has("timeWindowEnd") ? schedule.get("timeWindowEnd").asText() : null;
            if (timeStart != null && timeEnd != null && !timeStart.isEmpty() && !timeEnd.isEmpty()) {
                LocalTime now = LocalTime.now();
                LocalTime start = LocalTime.parse(timeStart);
                LocalTime end = LocalTime.parse(timeEnd);
                if (now.isBefore(start) || now.isAfter(end)) {
                    // 还在窗口外，但我们可以预先创建
                }
            }

            // 检查是否已有今天的提交记录（避免重复创建）
            // 个人模式下，需要为每个有权限的用户创建一条空记录
            // 协同模式下，只有一条全局记录

            // 简化：协同模式只检查已存在记录；个人模式由用户访问时 fetch-or-create
            String fillMode = "shared";
            if (form.getFillPolicyJson() != null) {
                var policy = objectMapper.readTree(form.getFillPolicyJson());
                fillMode = policy.has("mode") ? policy.get("mode").asText() : "shared";
            }

            if ("shared".equals(fillMode)) {
                // 协同模式：确保存在一条 user_id=0 的记录
                ReportFormSubmission existing = submissionMapper.selectByFormAndUser(form.getId(), 0L);
                if (existing == null) {
                    ReportFormSubmission sub = new ReportFormSubmission();
                    sub.setFormId(form.getId());
                    sub.setUserId(0L);
                    sub.setStatus("draft");
                    sub.setFieldValuesJson("{}");
                    sub.setVersion(0);
                    submissionMapper.insert(sub);
                    log.info("[report-form] 周期调度创建协同实例: form={} name={}", form.getId(), form.getName());
                }
            }
            // 个人模式：不做预创建，用户访问时自动 fetch-or-create

        } catch (Exception e) {
            log.warn("[report-form] 周期调度解析失败 form={}: {}", form.getId(), e.getMessage());
        }
    }

    private boolean matchesToday(String period, com.fasterxml.jackson.databind.JsonNode schedule) {
        LocalDate today = LocalDate.now();
        return switch (period) {
            case "daily" -> true;
            case "weekly" -> {
                int dayOfWeek = schedule.has("dayOfWeek") ? schedule.get("dayOfWeek").asInt() : 1;
                yield today.getDayOfWeek().getValue() == dayOfWeek;
            }
            case "monthly" -> {
                int dayOfMonth = schedule.has("dayOfMonth") ? schedule.get("dayOfMonth").asInt() : 1;
                yield today.getDayOfMonth() == Math.min(dayOfMonth, today.lengthOfMonth());
            }
            default -> false;
        };
    }
}
