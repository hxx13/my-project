package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 数据访问组（多中心隔离）。 */
@Data
public class CrfDag {
    private Long id;
    private String code;
    private Long studyId;
    private LocalDateTime createdAt;
}
