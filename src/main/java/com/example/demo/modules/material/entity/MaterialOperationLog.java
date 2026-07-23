package com.example.demo.modules.material.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MaterialOperationLog {
    private Long id;
    /** ITEM / REQUEST / CATEGORY */
    private String targetType;
    private String targetId;
    /** CREATE / UPDATE / DELETE / SUBMIT / APPROVE / REJECT / FULFILL / RECEIVE / INBOUND */
    private String action;
    private String operatorUserId;
    private String detail;
    private LocalDateTime createdAt;
}
