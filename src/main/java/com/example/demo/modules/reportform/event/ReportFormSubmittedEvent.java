package com.example.demo.modules.reportform.event;

/** 表单提交完成事件。消费方按需处理（如生成资格报告 PDF）。 */
public record ReportFormSubmittedEvent(Long formId, Long submissionId, Long userId) {
}
