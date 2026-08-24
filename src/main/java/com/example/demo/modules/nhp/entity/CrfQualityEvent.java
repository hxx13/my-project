package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 数据质量事件（V37 §6.5②）。 */
@Data
public class CrfQualityEvent {
    private Long id;
    /** OUTLIER / DEVIATION / TAT_OVERDUE / COC_BROKEN */
    private String eventType;
    private Long subjectId;
    /** record / sample / test_order / coc */
    private String refType;
    private Long refId;
    private String triggerRule;
    /** OPEN / REVIEWED / CLOSED */
    private String status;
    private String reviewer;
    /** 展示用复核人姓名（非持久列，UserDisplayNameService） */
    private String reviewerName;
    private LocalDateTime createdAt;
}
