package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RefOrderLogView {
    private Long id;
    private Long orderId;
    private String action;
    private String operatorId;
    private String detail;
    private LocalDateTime createdAt;
}
