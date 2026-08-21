package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 子模块（域内 D1.01 分组）。 */
@Data
public class CrfSection {
    private Long id;
    private Long formId;
    /** 子模块标识 D1.01 */
    private String code;
    private String name;
    private Integer sortOrder;
    private String description;
    private LocalDateTime createdAt;
}
