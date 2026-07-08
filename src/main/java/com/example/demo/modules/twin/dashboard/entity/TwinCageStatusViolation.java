package com.example.demo.modules.twin.dashboard.entity;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
public class TwinCageStatusViolation {
    private Long id;
    private Long ruleId;
    private String scanBatchId;
    private String statusCode;
    private Long cageShelveId;
    private Integer positionX;
    private Integer positionY;
    private String positionLabel;
    private String cageBoxQrCode;
    private String projectPiName;
    private String projectGroupName;
    private String departmentName;
    private String roomName;
    private String campusName;
    private LocalDateTime triggeredAt;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
