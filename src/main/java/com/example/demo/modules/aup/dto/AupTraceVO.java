package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 留痕（倒序）。
 */
@Data
public class AupTraceVO {

    private Long id;
    private String actor;
    private String actorName;
    private String role;
    private String action;
    private String fromStage;
    private String toStage;
    private String comment;
    private LocalDateTime createdAt;
}
