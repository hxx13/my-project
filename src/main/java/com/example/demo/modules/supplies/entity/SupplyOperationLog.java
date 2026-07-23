package com.example.demo.modules.supplies.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SupplyOperationLog {
    private Long id;
    private String opType;
    private String refType;
    private String refId;
    private String operatorUserId;
    private String detailJson;
    private LocalDateTime createdAt;
}
