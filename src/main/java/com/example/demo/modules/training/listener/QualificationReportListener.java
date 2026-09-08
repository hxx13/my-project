package com.example.demo.modules.training.listener;

import com.example.demo.modules.reportform.event.ReportFormSubmittedEvent;
import com.example.demo.modules.training.service.QualificationReportService;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** 表单提交 → 生成资格报告 PDF。生成失败不影响提交结果。 */
@Component
public class QualificationReportListener {

    private final QualificationReportService reportService;

    public QualificationReportListener(QualificationReportService reportService) {
        this.reportService = reportService;
    }

    @EventListener
    public void onSubmitted(ReportFormSubmittedEvent event) {
        if (event.userId() == null || event.userId() == 0L) {
            return;
        }
        reportService.onSubmitted(event.formId(), event.submissionId(), String.valueOf(event.userId()));
    }
}
