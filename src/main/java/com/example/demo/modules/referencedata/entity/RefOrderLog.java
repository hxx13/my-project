package com.example.demo.modules.referencedata.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RefOrderLog {
    private Long id;
    private Long orderId;
    private String action;
    private String operatorId;
    private String detail;
    private LocalDateTime createdAt;
}
