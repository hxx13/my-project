package com.example.demo.modules.reportform.task;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.example.demo.modules.reportform.service.ReportFillService;
import com.example.demo.modules.reportform.util.ReportFormBlocks;
import com.example.demo.modules.reportform.util.ReportFormPeriods;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
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
    private final ReportFillService reportFillService;
    private final ObjectMapper objectMapper;

    public ReportFormScheduleTask(ReportFormDefinitionMapper definitionMapper,
                                   ReportFormSubmissionMapper submissionMapper,
                                   ReportFillService reportFillService,
                                   ObjectMapper objectMapper) {
        this.definitionMapper = definitionMapper;
        this.submissionMapper = submissionMapper;
        this.reportFillService = reportFillService;
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
            String period = reportFillService.readPeriod(form);
            if (!ReportFormPeriods.isPeriodic(period)) return;

            var schedule = objectMapper.readTree(form.getScheduleJson());
            Integer dow = schedule.has("dayOfWeek") && !schedule.get("dayOfWeek").isNull()
                    ? schedule.get("dayOfWeek").asInt() : null;
            Integer dom = schedule.has("dayOfMonth") && !schedule.get("dayOfMonth").isNull()
                    ? schedule.get("dayOfMonth").asInt() : null;

            LocalDate today = LocalDate.now();
            if (!ReportFormPeriods.matchesDate(period, dow, dom, today)) return;

            String key = reportFillService.periodKeyOf(form, today);
            if (key == null) return;

            String fillMode = "shared";
            if (form.getFillPolicyJson() != null) {
                var policy = objectMapper.readTree(form.getFillPolicyJson());
                fillMode = policy.has("mode") ? policy.get("mode").asText() : "shared";
            }

            // 协同表：到点就为该期建一份空记录（每期一份，已存在则不重复建）
            // 个人表：不预建 —— 要为每个有权限的人预建，成本高；改为用户打开时按当前期 fetch-or-create
            if ("shared".equals(fillMode)) {
                ReportFormSubmission existing =
                        submissionMapper.selectByFormUserAndLabel(form.getId(), 0L, key);
                if (existing == null) {
                    ReportFormSubmission sub = new ReportFormSubmission();
                    sub.setFormId(form.getId());
                    sub.setUserId(0L);
                    sub.setInstanceLabel(key);
                    sub.setStatus("draft");
                    sub.setFieldValuesJson(ReportFormBlocks.toJson(ReportFormBlocks.normalize("{}")));
                    sub.setVersion(0);
                    LocalDateTime now = LocalDateTime.now();
                    sub.setCreatedAt(now);
                    sub.setUpdatedAt(now);
                    submissionMapper.insert(sub);
                    log.info("[report-form] 周期调度创建: form={} name={} period={}",
                            form.getId(), form.getName(), key);
                }
            }
        } catch (Exception e) {
            log.warn("[report-form] 周期调度解析失败 form={}: {}", form.getId(), e.getMessage());
        }
    }
}
