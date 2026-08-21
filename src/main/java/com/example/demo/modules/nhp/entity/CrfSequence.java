package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 序列（并发唯一取号，原子递增）。 */
@Data
public class CrfSequence {
    private Long id;
    private String idType;
    private String centerCode;
    private Integer year;
    private Integer nextValue;
    private LocalDateTime updatedAt;
}
