package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 序列（并发唯一取号，原子递增）。键=(id_type, scope_key)。 */
@Data
public class CrfSequence {
    private Long id;
    private String idType;
    /** 取号作用域键（V20260821027 泛化） */
    private String scopeKey;
    /** 兼容旧列，DON/RCP/TX 回填用 */
    private String centerCode;
    private Integer year;
    private Integer nextValue;
    private LocalDateTime updatedAt;
}
