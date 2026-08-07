package com.example.demo.modules.referencedata.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RefOrder {
    private Long id;
    private String groupId;
    private String submitterId;
    private String submitterName;
    private String projectGroupName;
    private String status;
    private String submitRemark;
    private LocalDateTime submittedAt;
    private LocalDateTime createdAt;
}
