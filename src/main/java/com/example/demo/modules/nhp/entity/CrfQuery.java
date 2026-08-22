package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 数据质疑。 */
@Data
public class CrfQuery {
    private Long id;
    private Long recordId;
    private Long fieldId;
    private String queryText;
    /** OPEN/ANSWERED/CLOSED */
    private String status;
    private String openedBy;
    /** 展示用发起人姓名（非持久列，UserDisplayNameService） */
    private String openedByName;
    private LocalDateTime openedAt;
    private String answeredBy;
    /** 展示用回复人姓名（非持久列，UserDisplayNameService） */
    private String answeredByName;
    private LocalDateTime answeredAt;
    private String answerText;
}
