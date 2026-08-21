package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 研究项目/方案（多研究隔离）。 */
@Data
public class CrfStudy {
    private Long id;
    /** 研究唯一标识，如 NHP-XENO */
    private String code;
    private String name;
    /** 方案版本号 */
    private String protocolVersion;
    /** 软删 0/1 */
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
