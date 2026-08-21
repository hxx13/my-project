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
    private LocalDateTime openedAt;
    private String answeredBy;
    private LocalDateTime answeredAt;
    private String answerText;
}
