package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RefOrderLogView {
    private Long id;
    private Long orderId;
    private String action;
    private String operatorId;
    /** 操作人展示名（staffId / 19 位 id 统一解析） */
    private String operatorName;
    private String detail;
    private LocalDateTime createdAt;
}
