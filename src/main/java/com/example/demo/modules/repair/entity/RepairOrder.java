package com.example.demo.modules.repair.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RepairOrder {
    private String id;
    private String applicantId;
    private String applicantName;
    private String location;
    private String content;
    private String status;
    private String requestImagesJson;
    private String resultImagesJson;
    private String resultRemark;
    private String processorId;
    private LocalDateTime createTime;
    private LocalDateTime startTime;
    private LocalDateTime finishTime;
    private LocalDateTime updateTime;
    private Integer deleted;
    private LocalDateTime deletedTime;
    private String deletedBy;
    private LocalDateTime purgeAfterTime;
    private Integer isPublic;
}
